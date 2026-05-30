// examples/strategy.mjs — a controller and an environment share a game. The controller can
// keep the system safe forever, but cannot reach the goal alone (the environment can always
// hinder); only the coalition of both can force the goal. So an obligation on the controller
// to reach the goal must ESCALATE — it cannot be discharged without recruiting the environment.
import { Game, atom, not, and, canKeep, canEnsure, oblige } from '../strategic.mjs';

const goal = atom('goal', (s) => s.name === 'goal');
const fail = atom('fail', (s) => s.name === 'fail');
const safe = not(fail);

// states
const S = { init: { name: 'init' }, safe: { name: 'safe' }, goal: { name: 'goal' }, fail: { name: 'fail' } };
const states = Object.values(S);
const agents = ['ctrl', 'env'];
// ctrl: 0 = advance, 1 = hold   ·   env: 0 = help, 1 = hinder
const moves = (a, s) => (s.name === 'goal' || s.name === 'fail') ? [0] : (a === 'ctrl' ? [0, 1] : [0, 1]);
function delta(s, jm) {
  if (s.name === 'goal') return S.goal; if (s.name === 'fail') return S.fail; // absorbing
  if (jm.ctrl === 1) return S.safe;                 // hold → stay safe
  return jm.env === 0 ? S.goal : S.safe;            // advance: help → goal, hinder → safe
}
const g = Game({ states, agents, moves, delta });

console.log('\nStrategic Arithmetic · who can force what');
console.log('\n  game: ctrl∈{advance,hold}, env∈{help,hinder}; advancing reaches the goal only if env helps.');

console.log('\n1 · the controller can keep the system safe forever');
console.log(`  ⟨⟨ctrl⟩⟩□ safe  from init? ${canKeep(g, ['ctrl'], safe, S.init)}   — holding avoids 'fail' indefinitely`);

console.log('\n2 · but the controller cannot reach the goal alone');
console.log(`  ⟨⟨ctrl⟩⟩◊ goal from init? ${canEnsure(g, ['ctrl'], goal, S.init)}   — env can always hinder`);
console.log(`  ⟨⟨env⟩⟩◊ goal  from init? ${canEnsure(g, ['env'], goal, S.init)}   — env can't force it either`);

console.log('\n3 · only the coalition can force the goal (superadditivity in action)');
console.log(`  ⟨⟨ctrl,env⟩⟩◊ goal from init? ${canEnsure(g, ['ctrl', 'env'], goal, S.init)}   — advance + help`);

console.log('\n4 · ought-implies-can: an obligation must respect ability');
console.log(`  oblige(ctrl, ◊goal)      → ${oblige(g, ['ctrl'], goal, S.init)}   — impossible alone, so it escalates`);
console.log(`  oblige(ctrl+env, ◊goal)  → ${oblige(g, ['ctrl', 'env'], goal, S.init)}   — the coalition can take it on`);
console.log('\n  Ability gates obligation upward into the deontic rung; coordination needs common knowledge.\n');
