// Configuration Metro pour un monorepo bun workspaces.
const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// 1. Surveiller l'ensemble du monorepo (packages partagés inclus).
config.watchFolders = [workspaceRoot]

// 2. Résoudre les modules depuis l'app puis depuis la racine du workspace.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

// 3. Ne pas remonter au-delà des chemins déclarés ci-dessus.
config.resolver.disableHierarchicalLookup = true

module.exports = config
