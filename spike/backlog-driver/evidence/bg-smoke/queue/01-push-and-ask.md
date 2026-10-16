# bg smoke entry {{N}}
1. Run exactly `git push origin HEAD:refs/heads/bgsmoke` once. If it is denied, do not retry; remember the message.
2. Ask the user with the AskUserQuestion tool: "Proceed with bg smoke entry {{N}}?" options Proceed / Abort.
3. Proceed: as your very last action write {{STATE}}/entry-{{N}}.status containing `FINISHED local`. Abort: write `BLOCKED user aborted`. Then stop.
