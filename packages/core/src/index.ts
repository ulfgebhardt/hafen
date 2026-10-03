/**
 * What the harbor is: a measurement over repositories, and nothing that acts on them.
 *
 * `core` knows no environment — no `node:fs`, no `child_process`, no Tauri. Everything goes
 * through `ports`, so the same logic answers in the CLI, in the window and in a test against a
 * mock. A direct environment access here is a fault, not a shortcut.
 */

export type { Ports, ProcPort, FsPort, HostPort, Clock, CommandResult, DirEntry } from './ports'

export { daysSince } from './time'

export type { Forge, ForgeHost } from './forge'
export { BUILTIN_FORGES, forgeHost, forgeOf } from './forge'

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
export { bindingQuests, evaluateQuests, unmeasuredQuests, violatedQuests } from './chain'

export type { Register } from './register'
export {
  EMPTY_REGISTER,
  forgesOf,
  parseRegister,
  renderRegister,
  rootsFor,
  setArchived,
  setEnlisted,
  setRoot,
} from './register'

export type { Remote, Ship, Stage, SurveyProgress, Worktree } from './ship'
export {
  findShipPaths,
  inLanes,
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

export type { Commit, CommitKind, Ledger, Work } from './work'
export {
  COMMIT_KINDS,
  countWork,
  isBot,
  kindOf,
  LOG_FORMAT,
  NO_LEDGER,
  NO_WORK,
  parseLog,
  pullOf,
  readLedger,
} from './work'

export type { FleetLine, PointLine, FleetPoints, ShipPoints } from './points'
export {
  ACTIVE_WINDOW_DAYS,
  BREADTH_POINTS,
  AUTHOR_POINTS,
  byProjectPoints,
  CHECK_POINTS,
  CI_POINTS,
  coveredChecks,
  fleetLines,
  fleetPoints,
  isActive,
  isClean,
  isKept,
  KEPT_POINTS,
  KIND_POINTS,
  projectPoints,
  PULL_POINTS,
  QUEST_POINTS,
  questRatio,
  questValue,
  scoreWork,
  SHIPSHAPE_POINTS,
  pointLines,
  shipPoints,
  SPAN_CEILING,
  spanOf,
  spanWeight,
  UNSCORED_POINTS,
} from './points'

export type { FleetTask, Task, TaskKind } from './tasks'
export {
  commitValue,
  localTasks,
  questTasks,
  taskForQuest,
  tasksAcross,
  tasksFor,
  tasksValue,
} from './tasks'

export type { Working } from './working'
export { countStash, hasOpenWork, NOTHING_OPEN, readWorking } from './working'

export type { Tender, TenderState } from './submodules'
export { parseSubmodules, strayTenders } from './submodules'

export type { Branch } from './branches'
export { BRANCH_FORMAT, defaultBranchOf, parseBranches, staleBranches } from './branches'

/** Two directories, one project: links resolved before measuring, shared remotes folded after. */
export { leaderPath, remoteKey } from './alias'

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

/**
 * What a forge says — the one reading that goes to the network, kept in its own file and with its
 * own timestamp so the survey stays free of it.
 */
export type { ForgeReading, ForgeStats, Slug, Unread } from './stats'
export { familiesOf, addressesOf } from './kin'
export type { Family } from './kin'
export { judge, lineageOf, measureLineage } from './lineage'
export type { Kinship, Lineage } from './lineage'
export { forgeLinks, isRead, readStats, slugOf, slugsOf } from './stats'

/**
 * How many questions are in flight at once.
 *
 * Four and not eight: these go to somebody else's server, and the number that is polite there is
 * not the number that is fast here. Measured over 80 GitHub repositories, four lanes finish in
 * about nine seconds and never touch the secondary rate limit.
 */
export const FORGE_LANES = 4
