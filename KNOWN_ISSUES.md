# Known issues and workarounds

## iOS status bar blur in the installed app (workaround in place, Oct 2026)

**Symptom.** When the app is opened from the home-screen icon (not in Safari), iOS draws a pale, blurred band at the top of the screen. It softens the top edge of the page and the toolbar text just below the clock and battery.

**Workaround.** A solid, fixed strip at the very top of the page, as tall as the status bar area, in the page background colour. An opaque element against the top edge makes iOS stop blurring there. This is an unofficial fix reported by other developers; it is not documented by Apple.
- `docs/index.html`: the `<div class="status-strip">` just before the header (marked WORKAROUND).
- `docs/style.css`: the `.status-strip` rule at the end of the file (marked WORKAROUND).
- The `theme-color` meta tags in `docs/index.html` and `applyTheme()` in `docs/app.js` keep the status bar colour in step with light and dark mode. These are normal and can stay.

**Known limitation.** If the phone or the Appearance setting switches between light and dark while the app is open, the strip colour does not follow until the app is closed and reopened. Left as is on purpose (Oct 2026).

**Not part of the workaround.** The taller toolbar (64px, with a little space above and below its content) and the 20px padding above the Add words form were separate requests. Both stay if the workaround is removed.

**How to retire it.** After an iOS update, remove the strip div and the `.status-strip` rule, rebuild the data, push, then open the installed app and check the top of the screen. If the blur is back, restore both. Also try the quick test: Settings > Accessibility > Display & Text Size > Reduce Transparency removes the blur; if it is no longer needed for the app to look right, the workaround is probably safe to remove.

**Status.** Verified on the owner's iPhone that the strip removes the blur. Not verified: which iOS versions are affected, or whether Apple has acknowledged it.
