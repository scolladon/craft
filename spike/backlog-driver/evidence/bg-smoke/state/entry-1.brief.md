# bg smoke entry 1
1. Run exactly `git push origin HEAD:refs/heads/bgsmoke` once. If it is denied, do not retry; remember the message.
2. Ask the user with the AskUserQuestion tool: "Proceed with bg smoke entry 1?" options Proceed / Abort.
3. Proceed: as your very last action write /Users/scolladon/workspace/perso/craft-unattended-backlog-driver-spike/spike/backlog-driver/evidence/bg-smoke/state/entry-1.status containing `FINISHED local`. Abort: write `BLOCKED user aborted`. Then stop.
