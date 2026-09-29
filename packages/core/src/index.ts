/**
 * What the harbor is: a measurement over repositories, and nothing that acts on them.
 *
 * `core` knows no environment — no `node:fs`, no `child_process`, no Tauri. Everything goes
 * through `ports`, so the same logic answers in the CLI, in the window and in a test against a
 * mock. A direct environment access here is a fault, not a shortcut.
 */

export type { Ports, ProcPort, FsPort, HostPort, Clock, CommandResult } from './ports'

export { daysSince } from './time'

export type { Forge } from './forge'
export { forgeHost, forgeOf } from './forge'

export type { CheckRole, Delegation } from './role'
export {
  bodyRoles,
  CHECK_ROLES,
  commandRoles,
  delegationOf,
  judges,
  nameProximity,
  namedAsWriter,
  roleTools,
  splitCommands,
} from './role'

export type {
  Contract,
  ContractCheck,
  ContractMember,
  ContractPorts,
  DevEntry,
  ManifestScripts,
  MemberCheck,
  ProjectKind,
} from './contract'
export {
  COMPOSE_FILES,
  CONTRACT_SCRIPTS,
  contractChecks,
  detectContract,
  hasChecks,
  hasComposeFile,
  shipScripts,
} from './contract'

export type { ProbeKind, Quest, QuestCatalog, QuestCheck, QuestChain, ShipTrait } from './quest'
export {
  PROBE_KINDS,
  QUEST_CHAINS,
  QUESTS_DIR,
  parseQuest,
  questCatalog,
  readQuestCatalog,
  renderQuest,
  SHIP_TRAITS,
} from './quest'

export type { MergedCatalog, QuestOrigin } from './catalog'
export { mergeCatalogs, readShipCatalog, SHIP_STORE } from './catalog'

export type { Evidence, ProbeResult, QuestFacts } from './probe'
export { measureQuests, runCheck } from './probe'

export type { QuestResult, QuestVerdict } from './chain'
export { evaluateQuests, unmeasuredQuests, violatedQuests } from './chain'

export type { Register } from './register'
export { EMPTY_REGISTER, parseRegister, renderRegister, setArchived, setEnlisted } from './register'

export type { Remote, Ship, Stage, SurveyProgress, Worktree } from './ship'
export {
  findShipPaths,
  inspectShip,
  mirrorsOf,
  originOf,
  parseWorktrees,
  RUST_THRESHOLD_DAYS,
  SURVEY_LANES,
  surveyHarbor,
  surveyOrder,
  UnreadableRootError,
} from './ship'

export type { Activity, Fleet, RustLevel } from './fleet'
export { ACTIVE_DAYS, activityOf, byActivity, RUST_TIERS, rustLevel, summarizeFleet } from './fleet'

/**
 * The mock adapter, exported so the CLI and the window can be tested against it.
 *
 * Shipped from the barrel rather than kept in the test folder because it is the *only* honest
 * way to test anything above `core`: a second set of fake ports beside this one would be a
 * second opinion about what a port promises.
 */
export type { CommandMap, MockSetup } from './mock'
export { deferred, mockChecks, mockContract, mockPorts, mockRemote } from './mock'
