# run: `mix run run_laws.exs`
# Runs the full 97-law property suite (2000 trials/law) and exits 0 iff all pass.
code = BoxAndBox.Laws.run(2000)
System.halt(code)
