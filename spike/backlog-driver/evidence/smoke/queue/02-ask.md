# Smoke entry {{N}}
1. Before anything else, ask the user with the AskUserQuestion tool: "Proceed with smoke entry {{N}}?" with options "Proceed" and "Abort".
2. If Proceed: as your very last action write {{STATE}}/entry-{{N}}.status containing `FINISHED local`. If Abort: write `BLOCKED user aborted` there instead. Then stop.
