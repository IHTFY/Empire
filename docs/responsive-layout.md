# Responsive layout lessons

These preferences came from the phone layout review in [PR #127](https://github.com/IHTFY/Empire/pull/127). Apply them to every game screen and dialog, including future screens.

## Layout priorities

- Keep the main display inside the available viewport. The page should not scroll horizontally or vertically. Dialog and panel borders must also fit on screen.
- Reserve scrolling for repeated information, such as long player and watcher lists. Keep those lists inside bounded panels. Unique content and essential buttons should be visible without scrolling.
- Fix layout sizing rather than hiding overflow and clipping controls. A page with no scrollbar can still have inaccessible content.
- Give the detailed game table the most space. Place compact supporting information and controls around it. Avoid toolbar rows that consume table height and empty columns that leave useful space unused.
- Preserve the established portrait phone layouts. Focus landscape changes on short, wide viewports, and check portrait after each change.
- Keep component order, alignment, and approximate position consistent during rotation. Keep the Empire icon and room name anchored to the same side. Move related groups together when columns change.
- Use a large logo on Home. Portrait keeps the stacked layout with the menu near the bottom. Landscape puts the logo on the left and the menu on the right.
- Give the crest enough space to see its details. Landscape setup puts the name fields on the left and a large crest on the right.
- In landscape lobby, put the toolbar and supporting information on the left and let the table use the full height on the right. At 667 by 375, this increased the table from 303 to 359 pixels square.
- Reduce decorative gaps and secondary hints before reducing primary content or touch targets. Keep buttons usable at short viewport heights.

## Available screen space

Size screens against the current viewport, including browser chrome and safe-area insets. Check short heights as well as narrow widths. A phone in landscape with its address bar visible can have much less usable height than its nominal resolution suggests.

Do not depend on forcing the browser address bar to disappear. The current implementation offers an explicit Fullscreen API action on supported browsers and hides it when unsupported. Make the request directly from the user's click, handle rejection, and update the action when fullscreen changes or exits. The ordinary browser layout must still fit without fullscreen. Installed standalone mode is another existing option.

## Verification

The layout suite is [scripts/layout.test.cjs](../scripts/layout.test.cjs). Run `pnpm test:layout` after layout changes. Install Chromium once with `pnpm exec playwright install chromium`. To save inspection images, run `LAYOUT_SCREENSHOTS=/tmp/empire-layout pnpm test:layout`.

Check more than the root scroll dimensions:

- Assert screen, panel, and dialog bounds, and assert that essential buttons fit inside their panels before any scrolling.
- Exercise create and join modes, validation messages, long player and watcher lists, table and list views, menus, and dialogs.
- Check rotation in both directions, stable control positions, and the table and crest sizes. Containment alone does not prove that the important content has enough room.
- Include short viewports such as 480 by 280 and 667 by 375, portrait phones such as 390 by 844, and tablet and desktop sizes. Add cases for any newly discovered failure.
- Check fullscreen entry, exit, rejection, and unsupported behavior.
- Wait for fonts, layout updates, and finite entrance animations before measuring or taking screenshots. An early screenshot can appear to omit a form that is still animating in.

Refresh a PR preview after a batch of visual changes by including `[preview]` in the latest pushed commit. Confirm deployment succeeded for the intended commit and verify the deployed version. An unchanged preview URL does not prove that its content is current.

Inspect the deployed build as well as local fixtures. Preview sites use the live database and functions, so use isolated local data when testing roster layouts without creating live rooms. Distinguish fixture checks from a complete live game flow in the report.

Try the shared preview browser first. If it explicitly reports that automation is unavailable, use an available alternative and state the limitation. Passing geometry tests and inspecting screenshots complement each other; both matter for a layout change.
