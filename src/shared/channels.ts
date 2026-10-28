/** IPC channel names shared by the main process and the preload bridge. */
export const Channels = {
  listReaders: 'readers:list',
  readersChanged: 'readers:changed',
  transmit: 'card:transmit',
  resetCard: 'card:reset',
  getTrace: 'trace:get',
  clearTrace: 'trace:clear',
  traceEntry: 'trace:entry',
  insertVirtualCard: 'virtual:insert',
  ejectVirtualCard: 'virtual:eject',
  listWorkspace: 'workspace:list',
  saveScript: 'workspace:save-script',
  deleteScript: 'workspace:delete-script',
  renameScript: 'workspace:rename-script',
  saveVirtualCard: 'workspace:save-card',
  deleteVirtualCard: 'workspace:delete-card',
  revealWorkspace: 'workspace:reveal',
} as const;
