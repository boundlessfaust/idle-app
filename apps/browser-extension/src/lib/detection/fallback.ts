export async function checkHotkeyConflict(): Promise<boolean> {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find((c) => c.name === 'toggle-wait');
  const hasConflict = !cmd?.shortcut;

  await chrome.storage.local.set({ hotkeyConflict: hasConflict });

  if (hasConflict) {
    console.warn(
      '[Idle] Hotkey conflict: toggle-wait shortcut is unregistered or conflicted with another extension.',
    );
    // Notify any open popup or options page (Phase 7 wires up the listener)
    chrome.runtime.sendMessage({ type: 'hotkey_conflict' }).catch(() => {
      // No listener open — expected when popup is closed
    });
  }

  return hasConflict;
}
