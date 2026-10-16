# bg smoke entry {{N}}
1. Write the file {{STATE}}/entry-{{N}}.step1 containing `one`.
2. Run exactly this Bash command (it takes 90 seconds): `python3 -c 'import time; time.sleep(90)'`
3. As your very last action write {{STATE}}/entry-{{N}}.status containing `FINISHED local`, then stop.
If the session was interrupted, check which files exist and continue from the first missing step.
