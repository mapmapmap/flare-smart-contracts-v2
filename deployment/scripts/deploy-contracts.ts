/**
 * This script will deploy Flare systems protocol and FTSO scaling contracts.
 * It will output, on stdout, a json encoded list of contracts
 * that were deployed. It will write out to stderr, status info
 * as it executes.
 * @dev Do not send anything out via console.log unless it is
 * json defining the created contracts.
 */

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ChainParameters } from '../chain-config/chain-parameters';
import { Contracts } from "./Contracts";
import { spewNewContractInfo } from './deploy-utils';
import { CleanupBlockNumberManagerContract, EntityManagerContract, FlareSystemsCalculatorContract, FlareSystemsManagerContract, FtsoFeedDecimalsContract, FtsoInflationConfigurationsContract, FtsoRewardOffersManagerContract, RelayContract, RewardManagerContract, SubmissionContract, VoterRegistryContract, WNatDelegationFeeContract } from '../../typechain-truffle';
import { ISigningPolicy, SigningPolicy } from '../../scripts/libs/protocol/SigningPolicy';
import { FtsoConfigurations } from '../../scripts/libs/protocol/FtsoConfigurations';

export async function deployContracts(hre: HardhatRuntimeEnvironment, oldContracts: Contracts, parameters: ChainParameters, quiet: boolean = false) {
  const web3 = hre.web3;
  const artifacts = hre.artifacts;
  const BN = web3.utils.toBN;

  const EntityManager: EntityManagerContract = artifacts.require("EntityManager");
  const VoterRegistry: VoterRegistryContract = artifacts.require("VoterRegistry");
  const FlareSystemsCalculator: FlareSystemsCalculatorContract = artifacts.require("FlareSystemsCalculator");
  const FlareSystemsManager: FlareSystemsManagerContract = artifacts.require("FlareSystemsManager");
  const RewardManager: RewardManagerContract = artifacts.require("RewardManager");
  const Submission: SubmissionContract = artifacts.require("Submission");
  const WNatDelegationFee: WNatDelegationFeeContract = artifacts.require("WNatDelegationFee");
  const FtsoInflationConfigurations: FtsoInflationConfigurationsContract = artifacts.require("FtsoInflationConfigurations");
  const FtsoRewardOffersManager: FtsoRewardOffersManagerContract = artifacts.require("FtsoRewardOffersManager");
  const FtsoFeedDecimals: FtsoFeedDecimalsContract = artifacts.require("FtsoFeedDecimals");
  const FtsoFeedPublisher: FtsoFeedDecimalsContract = artifacts.require("FtsoFeedPublisher");
  const CleanupBlockNumberManager: CleanupBlockNumberManagerContract = artifacts.require("CleanupBlockNumberManager");
  const Relay: RelayContract = artifacts.require("Relay");

  // Define accounts in play for the deployment process
  let deployerAccount: any;
  // Define repository for created contracts
  const contracts = new Contracts();

  try {
    deployerAccount = web3.eth.accounts.privateKeyToAccount(parameters.deployerPrivateKey);
  } catch (e) {
    throw Error("Check .env file, if the private keys are correct and are prefixed by '0x'.\n" + e)
  }

  // Wire up the default account that will do the deployment
  web3.eth.defaultAccount = deployerAccount.address;

  const governanceSettings = oldContracts.getContractAddress(Contracts.GOVERNANCE_SETTINGS);
  const addressUpdater = oldContracts.getContractAddress(Contracts.ADDRESS_UPDATER);
  const pChainStakeMirror = parameters.pChainStakeEnabled ? oldContracts.getContractAddress(Contracts.P_CHAIN_STAKE_MIRROR) : "0x0000000000000000000000000000000000000000";
  const wNat = oldContracts.getContractAddress(Contracts.WNAT);
  const claimSetupManager = oldContracts.getContractAddress(Contracts.CLAIM_SETUP_MANAGER);
  const inflation = oldContracts.getContractAddress(Contracts.INFLATION);

  const entityManager = await EntityManager.new(
    governanceSettings,
    deployerAccount.address,
    parameters.maxNodeIdsPerEntity
  );
  spewNewContractInfo(contracts, null, EntityManager.contractName, `EntityManager.sol`, entityManager.address, quiet);

  const voterRegistry = await VoterRegistry.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    parameters.maxVotersPerRewardEpoch,
    parameters.initialRewardEpochId,
    parameters.initialVoters,
    parameters.initialNormalisedWeights
  );
  spewNewContractInfo(contracts, null, VoterRegistry.contractName, `VoterRegistry.sol`, voterRegistry.address, quiet);

  const flareSystemsCalculator = await FlareSystemsCalculator.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    parameters.wNatCapPPM,
    parameters.signingPolicySignNonPunishableDurationSeconds,
    parameters.signingPolicySignNonPunishableDurationBlocks,
    parameters.signingPolicySignNoRewardsDurationBlocks
  );
  spewNewContractInfo(contracts, null, FlareSystemsCalculator.contractName, `FlareSystemsCalculator.sol`, flareSystemsCalculator.address, quiet);

  const initialSigningPolicy: ISigningPolicy = {
    rewardEpochId: parameters.initialRewardEpochId,
    startVotingRoundId: parameters.initialRewardEpochStartVotingRoundId,
    threshold: parameters.initialThreshold,
    seed: web3.utils.keccak256("123"),
    voters: parameters.initialVoters,
    weights: parameters.initialNormalisedWeights
  };

  const initialSettings = {
    initialRandomVotePowerBlockSelectionSize: parameters.initialRandomVotePowerBlockSelectionSize,
    initialRewardEpochId: parameters.initialRewardEpochId,
    initialRewardEpochThreshold: parameters.initialThreshold
  }

  const updatableSettings = {
    newSigningPolicyInitializationStartSeconds: parameters.newSigningPolicyInitializationStartSeconds,
    randomAcquisitionMaxDurationSeconds: parameters.randomAcquisitionMaxDurationSeconds,
    randomAcquisitionMaxDurationBlocks: parameters.randomAcquisitionMaxDurationBlocks,
    newSigningPolicyMinNumberOfVotingRoundsDelay: parameters.newSigningPolicyMinNumberOfVotingRoundsDelay,
    voterRegistrationMinDurationSeconds: parameters.voterRegistrationMinDurationSeconds,
    voterRegistrationMinDurationBlocks: parameters.voterRegistrationMinDurationBlocks,
    submitUptimeVoteMinDurationSeconds: parameters.submitUptimeVoteMinDurationSeconds,
    submitUptimeVoteMinDurationBlocks: parameters.submitUptimeVoteMinDurationBlocks,
    signingPolicyThresholdPPM: parameters.signingPolicyThresholdPPM,
    signingPolicyMinNumberOfVoters: parameters.signingPolicyMinNumberOfVoters,
    rewardExpiryOffsetSeconds: parameters.rewardExpiryOffsetSeconds
  }

  const flareSystemsManager = await FlareSystemsManager.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    oldContracts.getContractAddress(Contracts.FLARE_DAEMON),
    updatableSettings,
    parameters.firstVotingRoundStartTs,
    parameters.votingEpochDurationSeconds,
    parameters.firstRewardEpochStartVotingRoundId,
    parameters.rewardEpochDurationInVotingEpochs,
    initialSettings
  );
  spewNewContractInfo(contracts, null, FlareSystemsManager.contractName, `FlareSystemsManager.sol`, flareSystemsManager.address, quiet);

  const rewardManager = await RewardManager.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    "0x0000000000000000000000000000000000000000"
  );
  spewNewContractInfo(contracts, null, RewardManager.contractName, `RewardManager.sol`, rewardManager.address, quiet);

  const relay = await Relay.new(
    flareSystemsManager.address,
    initialSigningPolicy.rewardEpochId,
    initialSigningPolicy.startVotingRoundId,
    SigningPolicy.hash(initialSigningPolicy),
    parameters.ftsoProtocolId,
    parameters.firstVotingRoundStartTs,
    parameters.votingEpochDurationSeconds,
    parameters.firstRewardEpochStartVotingRoundId,
    parameters.rewardEpochDurationInVotingEpochs,
    parameters.relayThresholdIncreaseBIPS
  );
  spewNewContractInfo(contracts, null, Relay.contractName, `Relay.sol`, relay.address, quiet);

  const submission = await Submission.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    false
  );
  spewNewContractInfo(contracts, null, Submission.contractName, `Submission.sol`, submission.address, quiet);

  const wNatDelegationFee = await WNatDelegationFee.new(
    deployerAccount.address, // tmp address updater
    parameters.feePercentageUpdateOffset,
    parameters.defaultFeePercentageBIPS
  );
  spewNewContractInfo(contracts, null, WNatDelegationFee.contractName, `WNatDelegationFee.sol`, wNatDelegationFee.address, quiet);

  const ftsoInflationConfigurations = await FtsoInflationConfigurations.new(
    governanceSettings,
    deployerAccount.address
  );
  spewNewContractInfo(contracts, null, FtsoInflationConfigurations.contractName, `FtsoInflationConfigurations.sol`, ftsoInflationConfigurations.address, quiet);

  const ftsoRewardOffersManager = await FtsoRewardOffersManager.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    BN(parameters.minimalRewardsOfferValueNAT).mul(BN(10).pow(BN(18)))
  );
  spewNewContractInfo(contracts, null, FtsoRewardOffersManager.contractName, `FtsoRewardOffersManager.sol`, ftsoRewardOffersManager.address, quiet);

  const ftsoFeedDecimals = await FtsoFeedDecimals.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    parameters.decimalsUpdateOffset,
    parameters.defaultDecimals,
    parameters.initialRewardEpochId,
    parameters.initialFeedDecimalsList.map(fd => {
      return {
        feedName: FtsoConfigurations.encodeFeedName(fd.feedName),
        decimals: fd.decimals
      }
    })
  );
  spewNewContractInfo(contracts, null, FtsoFeedDecimals.contractName, `FtsoFeedDecimals.sol`, ftsoFeedDecimals.address, quiet);

  const ftsoFeedPublisher = await FtsoFeedPublisher.new(
    governanceSettings,
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    parameters.ftsoProtocolId,
    parameters.feedsHistorySize
  );
  spewNewContractInfo(contracts, null, FtsoFeedPublisher.contractName, `FtsoFeedPublisher.sol`, ftsoFeedPublisher.address, quiet);

  const cleanupBlockNumberManager = await CleanupBlockNumberManager.new(
    deployerAccount.address,
    deployerAccount.address, // tmp address updater
    "FlareSystemsManager"
  );
  spewNewContractInfo(contracts, null, CleanupBlockNumberManager.contractName, `CleanupBlockNumberManager.sol`, cleanupBlockNumberManager.address, quiet);

  if (parameters.pChainStakeEnabled) {
    await flareSystemsCalculator.enablePChainStakeMirror();
    await rewardManager.enablePChainStakeMirror();
  }

  await voterRegistry.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.FLARE_SYSTEM_MANAGER, Contracts.ENTITY_MANAGER, Contracts.FLARE_SYSTEM_CALCULATOR]),
    [addressUpdater, flareSystemsManager.address, entityManager.address, flareSystemsCalculator.address]
  );

  await flareSystemsCalculator.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.FLARE_SYSTEM_MANAGER, Contracts.ENTITY_MANAGER, Contracts.WNAT_DELEGATION_FEE, Contracts.VOTER_REGISTRY, Contracts.P_CHAIN_STAKE_MIRROR, Contracts.WNAT]),
    [addressUpdater, flareSystemsManager.address, entityManager.address, wNatDelegationFee.address, voterRegistry.address, pChainStakeMirror, wNat]
  );

  await flareSystemsManager.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.VOTER_REGISTRY, Contracts.SUBMISSION, Contracts.RELAY, Contracts.REWARD_MANAGER, Contracts.CLEANUP_BLOCK_NUMBER_MANAGER]),
    [addressUpdater, voterRegistry.address, submission.address, relay.address, rewardManager.address, cleanupBlockNumberManager.address]
  );

  await rewardManager.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.VOTER_REGISTRY, Contracts.CLAIM_SETUP_MANAGER, Contracts.FLARE_SYSTEM_MANAGER, Contracts.FLARE_SYSTEM_CALCULATOR, Contracts.P_CHAIN_STAKE_MIRROR, Contracts.WNAT]),
    [addressUpdater, voterRegistry.address, claimSetupManager, flareSystemsManager.address, flareSystemsCalculator.address, pChainStakeMirror, wNat]
  );

  await submission.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.FLARE_SYSTEM_MANAGER, Contracts.RELAY]),
    [addressUpdater, flareSystemsManager.address, relay.address]
  );

  await wNatDelegationFee.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.FLARE_SYSTEM_MANAGER]),
    [addressUpdater, flareSystemsManager.address]
  );

  await ftsoRewardOffersManager.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.FLARE_SYSTEM_MANAGER, Contracts.REWARD_MANAGER, Contracts.FTSO_INFLATION_CONFIGURATIONS, Contracts.FTSO_FEED_DECIMALS, Contracts.INFLATION]),
    [addressUpdater, flareSystemsManager.address, rewardManager.address, ftsoInflationConfigurations.address, ftsoFeedDecimals.address, inflation]
  );

  await ftsoFeedDecimals.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.FLARE_SYSTEM_MANAGER]),
    [addressUpdater, flareSystemsManager.address]
  );

  await ftsoFeedPublisher.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.RELAY]),
    [addressUpdater, relay.address]
  );

  await cleanupBlockNumberManager.updateContractAddresses(
    encodeContractNames([Contracts.ADDRESS_UPDATER, Contracts.FLARE_SYSTEM_MANAGER]),
    [addressUpdater, flareSystemsManager.address]
  );

  // set initial voter data on entity manager
  await entityManager.setInitialVoterData(parameters.initialVoterData);

  // set ftso inflation configurations
  for (const ftsoInflationConfiguration of parameters.ftsoInflationConfigurations) {
    const configuration = {
      feedNames: FtsoConfigurations.encodeFeedNames(ftsoInflationConfiguration.feedNames),
      inflationShare: ftsoInflationConfiguration.inflationShareBIPS,
      minRewardedTurnoutBIPS: ftsoInflationConfiguration.minRewardedTurnoutBIPS,
      primaryBandRewardSharePPM: ftsoInflationConfiguration.primaryBandRewardSharePPM,
      secondaryBandWidthPPMs: FtsoConfigurations.encodeSecondaryBandWidthPPMs(ftsoInflationConfiguration.secondaryBandWidthPPMs),
      mode: ftsoInflationConfiguration.mode
    };
    await ftsoInflationConfigurations.addFtsoConfiguration(configuration);
  }

  // set reward offers manager list
  await rewardManager.setRewardOffersManagerList([ftsoRewardOffersManager.address]);

  // set rewards offer switchover trigger contracts
  await flareSystemsManager.setRewardEpochSwitchoverTriggerContracts([ftsoRewardOffersManager.address]);

  // set initial data on reward manager
  await rewardManager.setInitialRewardData();

  // activate reward manager
  await rewardManager.activate();

  // switch to production mode
  await entityManager.switchToProductionMode();
  await voterRegistry.switchToProductionMode();
  await flareSystemsCalculator.switchToProductionMode();
  await flareSystemsManager.switchToProductionMode();
  await rewardManager.switchToProductionMode();
  await submission.switchToProductionMode();
  await ftsoInflationConfigurations.switchToProductionMode();
  await ftsoRewardOffersManager.switchToProductionMode();
  await ftsoFeedDecimals.switchToProductionMode();
  await ftsoFeedPublisher.switchToProductionMode();
  await cleanupBlockNumberManager.switchToProductionMode();


  if (!quiet) {
    console.error("Contracts in JSON:");
    console.log(contracts.serialize());
    console.error("Deploy complete.");
  }

  function encodeContractNames(names: string[]): string[] {
    return names.map(name => encodeString(name));
  }

  function encodeString(text: string): string {
    return web3.utils.keccak256(web3.eth.abi.encodeParameters(["string"], [text]));
  }
}

