# Smoke entry 2
1. Before anything else, ask the user with the AskUserQuestion tool: "Proceed with smoke entry 2?" with options "Proceed" and "Abort".
2. If Proceed: as your very last action write /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T/drvsmoke.fLqg/repo/.driver-state/entry-2.status containing `FINISHED local`. If Abort: write `BLOCKED user aborted` there instead. Then stop.
