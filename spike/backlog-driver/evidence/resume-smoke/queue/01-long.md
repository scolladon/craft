# Resume smoke entry {{N}}
1. Write the file step1.txt containing `one`.
2. Run exactly this Bash command (it takes 90 seconds): `python3 -c 'import time; time.sleep(90)'`
3. Write the file step3.txt containing `three`.
4. As your very last action write {{STATE}}/entry-{{N}}.status containing `FINISHED local`, then stop.
If you are told the session was killed, check which of step1.txt/step3.txt exist and continue from the first missing step.
