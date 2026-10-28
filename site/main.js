// Points the download buttons straight at the latest release's files. If GitHub can't be reached,
// or there's no release yet, the buttons keep linking to the releases page.
(async () => {
  const platform = /Mac/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent)
    ? 'mac'
    : /Win/.test(navigator.platform)
      ? 'win'
      : /Linux/.test(navigator.platform)
        ? 'linux'
        : undefined;

  let release;
  try {
    const response = await fetch('https://api.github.com/repos/tomkp/card-spy/releases/latest');
    if (!response.ok) return;
    release = await response.json();
  } catch {
    return;
  }

  const asset = (suffix) => release.assets.find((a) => a.name.endsWith(suffix));
  for (const link of document.querySelectorAll('[data-asset]')) {
    const file = asset(link.dataset.asset);
    if (file) link.href = file.browser_download_url;
  }

  const date = new Date(release.published_at).toLocaleDateString(undefined, { dateStyle: 'medium' });
  document.getElementById('release-name').textContent = `${release.tag_name}, released ${date}.`;

  const primary = document.getElementById('download-primary');
  const preferred = { mac: 'mac-arm64.dmg', win: 'win-x64.exe', linux: '.AppImage' }[platform];
  const file = preferred && asset(preferred);
  if (file) {
    primary.href = file.browser_download_url;
    primary.textContent = { mac: 'Download for macOS', win: 'Download for Windows', linux: 'Download for Linux' }[platform];
    document.getElementById('download-meta').textContent =
      `${release.tag_name} · other platforms and Intel Macs below · free and open source (MIT)`;
  }
})();
