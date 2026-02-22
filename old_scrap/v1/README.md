# PXVM-Script Explained: From Elevator Pitch to Deep Dive

---

## 🎯 The Elevator Pitch (30 seconds)

**"What if your code could feel forces and conserve energy—just like physics?"**

PXVM-Script is a programming language where **functions are particles** that exist in physical space. They have position, velocity, and temperature. Instead of writing explicit loops and conditions, you express what you want using **force fields**—attractors pull toward goals, repulsors push away from bad states, and the GPU finds the optimal solution through physics simulation.

**Result:** Code that's easier to write (declarative), faster to run (GPU-accelerated), and actually explainable (force diagrams show why decisions were made).

**Use it for:** AI optimization, adaptive systems, creative generation, anything where you're balancing multiple objectives.

---

## 📖 The 2-Minute Explanation

### **The Core Idea**

Traditional programming: You tell the computer *how* to do something, step by step.

PXVM-Script: You tell the computer *what you want* using physics, and it figures out *how*.

### **Example: Selecting the Best LLM Response**

**Traditional approach (Python):**
```python
# You write explicit logic
best_score = -inf
best_response = None
for response in llm_responses:
    score = (
        0.9 * accuracy(response) +
        -0.6 * cost(response) +
        0.4 * novelty(response)
    )
    if score > best_score:
        best_score = score
        best_response = response
```

**PXVM-Script approach:**
```elixir
defphysics select_best(responses) do
  # Each response is a particle
  # Forces represent objectives
  
  attracted_to(:accuracy, strength: 0.9)   # Pull toward accurate
  repelled_by(:high_cost, strength: 0.6)   # Push away from expensive
  attracted_to(:novelty, strength: 0.4)    # Pull toward creative
  
  # GPU physics finds equilibrium
  # Winner = particle at lowest energy state
  GraphPhysics.embed(responses, backend: :auto)
end
```

### **What Just Happened?**

1. **Responses became particles** in 3D space
2. **Objectives became forces** (attractors/repulsors)
3. **GPU ran physics simulation** to find stable equilibrium
4. **Best response** = the particle that settled at optimal position

### **Why This Matters**

✅ **Explainable:** "Response A won because accuracy force (0.9) > cost penalty (-0.6)"  
✅ **Multi-objective:** Forces naturally superpose—no hand-tuning weights  
✅ **GPU-accelerated:** 19× faster than CPU (can re-optimize in real-time)  
✅ **Deterministic:** Same inputs → same output (not random like LLMs)

---

## 🔬 The Technical Deep Dive

---

## Part 1: Core Concepts

### 1.1 Physics Context

**Every function in PXVM-Script tracks physical state:**

```elixir
defphysics my_function(x) do
  ctx = physics_context
  
  # Automatically tracked:
  ctx.position      # {x, y, z} in concept space
  ctx.velocity      # Rate of change
  ctx.temperature   # Exploration vs. exploitation (0.0-1.0)
  ctx.mass          # Importance/weight
  ctx.energy        # Computational cost
  ctx.call_count    # How often invoked
end
```

**Why this matters:**
- **Position** = where you are in the solution space
- **Velocity** = momentum toward solution (prevents oscillation)
- **Temperature** = randomness/exploration level
- **Mass** = how hard to move (resistance to change)

---

### 1.2 Force Fields

**The language provides physics primitives as first-class features:**

#### **Attractor Fields**
```elixir
in_field :attractor, center: goal_state, strength: 0.9 do
  # Code inside is "pulled" toward goal
end
```

Particles experience force proportional to distance: `F = -k * (position - center)`

#### **Repulsor Fields**
```elixir
in_field :repulsor, center: invalid_state, strength: 1.0 do
  # Code inside is "pushed away" from constraints
end
```

Inverse relationship: close constraints have stronger repulsion.

#### **Vortex Fields**
```elixir
in_field :vortex, axis: :exploration, strength: 0.5 do
  # Creates circular motion (explores around a point)
end
```

Tangential force creates orbital patterns (useful for creative exploration).

#### **Uniform Fields**
```elixir
in_field :uniform, direction: :progress, strength: 0.7 do
  # Constant force in one direction (like gravity)
end
```

---

### 1.3 Spatial Relationships

**Express intent through relative positioning:**

```elixir
# Pull toward best known solution
attracted_to(current_best, strength: 0.8)

# Avoid known bad states
repelled_by(failures, strength: 1.0)

# Find similar concepts
similar = nearby(radius: 10.0)
```

These compile to force calculations that GPU can parallelize.

---

### 1.4 Temperature Control

**Temperature is the meta-parameter:**

```elixir
# High temperature = exploration
hot_path do
  # Random/creative behavior
  # Large search radius
  # Accept suboptimal moves
end

# Low temperature = exploitation
cold_storage do
  # Focused optimization
  # Small search radius
  # Only accept improvements
end
```

**Simulated annealing pattern:**
```elixir
temperature = 1.0  # Start hot
for i <- 1..1000 do
  explore_and_optimize()
  temperature = temperature * 0.99  # Cool gradually
end
```

---

### 1.5 Conservation Laws

**Type system enforces physical constraints:**

```elixir
conserving [:energy, :information] do
  # Compiler guarantees:
  # - Energy in = Energy out
  # - Information cannot be created/destroyed
  
  result = transform(data)
  
  # Compiler error if conservation violated
end
```

**Why conserve information?**
- Prevents hallucination in AI systems
- Guarantees output is grounded in input
- Enables replay/audit trails

---

## Part 2: How It Actually Works

### 2.1 Compilation Pipeline

**Step 1: Parse PXVM-Script → AST**
```
Source Code → Lexer → Parser → Abstract Syntax Tree
```

**Step 2: Physics Analysis**
- Extract force field declarations
- Build constraint graph
- Identify conservation requirements
- Calculate computational cost estimates

**Step 3: Backend Selection**
```elixir
if node_count > 1000 and gpu_available? do
  backend = :vulkan_compute
else
  backend = :cpu_deterministic
end
```

**Step 4: Code Generation**
- **CPU path:** Elixir bytecode (BEAM VM)
- **GPU path:** Vulkan SPIR-V shaders
- **Hybrid:** Mix of both (common case)

---

### 2.2 Runtime Execution Model

**When you call a `defphysics` function:**

```
1. Initialize physics context
   ├─ Allocate position/velocity/temperature
   └─ Set initial state

2. Execute function body
   ├─ Accumulate forces from fields
   ├─ Apply spatial relationships
   └─ Track conservation quantities

3. If optimization required:
   ├─ Build graph representation
   ├─ Dispatch to GPU (if enabled)
   ├─ Run relaxation iterations
   └─ Return optimal configuration

4. Update context
   ├─ New position/velocity
   ├─ Temperature adjustment
   └─ Call count increment

5. Verify conservation
   ├─ Check invariants
   └─ Raise error if violated
```

---

### 2.3 GPU Acceleration Deep Dive

**How PXVM-Script Uses the GPU:**

#### **Graph Physics Module (`AII.GraphPhysics`)**

**Input:** Graph with nodes, edges, forces
```elixir
graph = %{
  nodes: [
    %{id: 1, position: {0, 0, 0}, velocity: {0, 0, 0}},
    %{id: 2, position: {1, 0, 0}, velocity: {0, 0, 0}},
    # ... 1000s more
  ],
  edges: [
    {1, 2, strength: 0.5},  # Spring between nodes
    # ...
  ],
  forces: [
    {:attractor, center: {5, 5, 5}, strength: 0.9},
    {:repulsor, center: {0, 0, 0}, strength: 0.6}
  ]
}
```

**GPU Kernels (Vulkan Compute Shaders):**

**Kernel 1: `graph_force.spv` - Compute forces**
```glsl
// Pseudo-code (actual SPIR-V is binary)
layout(local_size_x = 256) in;

void main() {
  uint idx = gl_GlobalInvocationID.x;
  if (idx >= num_nodes) return;
  
  vec3 total_force = vec3(0);
  vec3 pos = positions[idx];
  
  // Spring forces (edges)
  for (edge in edges_for_node[idx]) {
    vec3 other_pos = positions[edge.target];
    vec3 delta = other_pos - pos;
    total_force += edge.strength * delta;
  }
  
  // Repulsion (all other nodes)
  for (uint j = 0; j < num_nodes; j++) {
    if (j == idx) continue;
    vec3 delta = positions[j] - pos;
    float dist = length(delta);
    total_force -= repulsion_strength / (dist * dist) * normalize(delta);
  }
  
  // External fields
  for (field in force_fields) {
    total_force += evaluate_field(field, pos);
  }
  
  forces[idx] = total_force;
}
```

**Kernel 2: `graph_integrate.spv` - Update positions**
```glsl
void main() {
  uint idx = gl_GlobalInvocationID.x;
  
  vec3 force = forces[idx];
  vec3 vel = velocities[idx];
  vec3 pos = positions[idx];
  
  // Velocity Verlet integration
  vel += force * dt;
  vel *= damping;  // Energy dissipation
  pos += vel * dt;
  
  velocities[idx] = vel;
  positions[idx] = pos;
}
```

**Kernel 3: `spatial_query_grid.spv` - Fast neighbor search**
```glsl
// Grid-based spatial hashing
void main() {
  uint idx = gl_GlobalInvocationID.x;
  vec3 pos = positions[idx];
  
  // Compute grid cell
  ivec3 cell = ivec3(floor(pos / cell_size));
  
  // Check neighboring cells only (not all nodes)
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dz = -1; dz <= 1; dz++) {
        ivec3 neighbor_cell = cell + ivec3(dx, dy, dz);
        check_cell_for_neighbors(neighbor_cell, idx);
      }
    }
  }
}
```

**Result:** 140× faster neighbor queries vs. brute force

---

#### **Execution Pipeline (GPU Path)**

```
1. Pack data for GPU
   ├─ Serialize positions/velocities → buffer
   ├─ Encode force fields → buffer
   └─ Upload to GPU memory (< 7ms for 8K nodes)

2. Dispatch compute shader
   ├─ Vulkan command buffer
   ├─ Launch 256 threads/workgroup
   └─ GPU execution (~ 11ms for 8K nodes)

3. Read results
   ├─ Download from GPU memory
   ├─ Decode positions/velocities
   └─ Update physics context (< 4ms)

Total: ~23ms for 8,192 nodes
```

**Optimization: Batching**
```elixir
# Instead of 100 separate relaxations...
for i <- 1..100 do
  relax_graph(graph)  # 23ms × 100 = 2300ms
end

# Batch them together
relax_graph_batch(graph, steps: 100)  # 584ms total
# = 5.84ms per step (4× improvement)
```

---

### 2.4 Memory Management

**Challenge:** GPU memory is separate from CPU memory

**Solution: Smart buffer pooling**

```elixir
# Naive approach (slow)
for iteration <- 1..100 do
  buffer = allocate_gpu_buffer(size)  # Expensive!
  upload(buffer, data)
  compute(buffer)
  download(buffer, result)
  free(buffer)  # Expensive!
end

# Pooled approach (fast)
buffer_pool = BufferPool.init(max_size: 100_MB)

for iteration <- 1..100 do
  buffer = BufferPool.acquire(size)  # Reuse!
  upload(buffer, data)
  compute(buffer)
  download(buffer, result)
  BufferPool.release(buffer)  # Return to pool
end

BufferPool.cleanup()  # Free once at end
```

**Result:** Zero allocations during steady-state execution

---

### 2.5 Determinism Guarantees

**Problem:** GPUs are non-deterministic (floating-point rounding, thread scheduling)

**PXVM-Script Solution:**

**Option 1: CPU Fallback (Default)**
```elixir
# Always use deterministic CPU path
GraphPhysics.embed(graph, backend: :cpu)
```

**Option 2: GPU with Deterministic Algorithms**
```elixir
# Use GPU but with fixed precision + ordering
GraphPhysics.embed(graph, 
  backend: :gpu,
  deterministic: true,  # Enables:
  precision: :fixed64,  # Fixed-point instead of float
  reduce_order: :sorted # Sorted reduction (stable)
)
```

**Option 3: Best of Both**
```elixir
# Development: deterministic CPU
# Production: fast GPU
backend = if Mix.env() == :test, do: :cpu, else: :auto
GraphPhysics.embed(graph, backend: backend)
```

---

## Part 3: Real-World Examples

### 3.1 Complete Example: Adaptive Curriculum

**Problem:** Generate personalized learning path for student

**Traditional approach:** Hand-coded rules, static prerequisites

**PXVM-Script approach:** Physics simulation

```elixir
use PXVMScript

defmodule AdaptiveLearning do
  defphysics generate_curriculum(student, subject) do
    # Load knowledge graph
    concepts = KnowledgeGraph.load(subject)
    
    # Student's current position = what they know
    current_knowledge = student.mastered_concepts
    
    # Goal = subject mastery
    goal = subject.required_concepts
    
    # Build physics simulation
    curriculum = 
      concepts
      |> assign_physics_properties()
      |> apply_learning_forces(student, goal)
      |> simulate_learning_path()
    
    curriculum
  end
  
  defp assign_physics_properties(concepts) do
    Enum.map(concepts, fn concept ->
      %{
        concept | 
        mass: concept.difficulty,        # Harder = more mass
        position: concept.topic_coords,   # Location in subject space
        prerequisites: concept.deps       # Springs to prereqs
      }
    end)
  end
  
  defp apply_learning_forces(concepts, student, goal) do
    # Start with high temperature (explore broadly)
    temperature = 0.8
    
    # Pull toward student interests
    attracted_to(student.interests, strength: 0.6)
    
    # Pull toward course goals
    attracted_to(goal, strength: 0.9)
    
    # Avoid mastered concepts
    repelled_by(student.mastered_concepts, strength: 0.7)
    
    # Prerequisites create springs
    for concept <- concepts do
      for prereq <- concept.prerequisites do
        spring(prereq, concept, stiffness: 0.8)
      end
    end
    
    # Gradually focus (simulated annealing)
    for week <- 1..12 do
      # Start hot (explore), end cold (focus)
      temperature = 0.8 - (week / 12) * 0.6
      
      weekly_topics = 
        if temperature > 0.5 do
          hot_path do
            # High temp = explore diverse topics
            in_field :vortex, axis: :breadth do
              select_concepts(concepts, count: 5)
            end
          end
        else
          cold_storage do
            # Low temp = focus on weak areas
            attracted_to(student.weak_areas, strength: 0.9) do
              select_concepts(concepts, count: 3)
            end
          end
        end
      
      emit_week(week, weekly_topics)
    end
  end
  
  defp simulate_learning_path(concepts) do
    # Let physics find optimal path
    conserving [:knowledge_prerequisites] do
      # Conservation = can't learn advanced topics before basics
      
      GraphPhysics.embed(concepts,
        iterations: 200,
        backend: :auto,  # GPU if available
        damping: 0.3,    # Prevent oscillation
        temperature_schedule: :annealing
      )
    end
  end
end
```

**Usage:**
```elixir
student = %Student{
  mastered_concepts: [:variables, :loops, :functions],
  weak_areas: [:recursion, :algorithms],
  interests: [:game_dev, :ai]
}

curriculum = AdaptiveLearning.generate_curriculum(
  student, 
  :computer_science_101
)

# Returns personalized 12-week learning path
# Week 1: Explore game_dev + ai topics (high temp)
# Week 6: Focus on recursion practice (medium temp)
# Week 12: Deep dive on weak algorithms (low temp)
```

---

### 3.2 Complete Example: LLM Ensemble Selector

**Problem:** You have 5 LLM responses, need to pick the best one

**Physics approach:**

```elixir
defmodule LLMSelector do
  defphysics select_best(prompt, responses, objectives) do
    # Each response becomes a particle
    particles = 
      Enum.map(responses, fn response ->
        %Particle{
          id: response.id,
          position: embed_semantically(response.text),
          attributes: %{
            accuracy: score_accuracy(response, prompt),
            cost: response.tokens * 0.001,
            novelty: score_novelty(response, responses),
            latency: response.generation_time
          }
        }
      end)
    
    # Define force field based on objectives
    field = ForceField.new()
    
    # Objectives from user (can change dynamically)
    # Example: %{accuracy: 0.9, cost: -0.6, novelty: 0.4, latency: -0.3}
    for {objective, strength} <- objectives do
      if strength > 0 do
        # Positive = attractor
        field = ForceField.add_attractor(field, 
          center: objective_center(objective),
          strength: strength
        )
      else
        # Negative = repulsor
        field = ForceField.add_repulsor(field,
          center: objective_center(objective),
          strength: abs(strength)
        )
      end
    end
    
    # Run physics simulation
    result = 
      conserving [:information] do
        # Can't create/destroy information
        # Output must be grounded in inputs
        
        GraphPhysics.embed(particles,
          force_field: field,
          backend: :auto,
          iterations: 50  # Fast convergence for UI
        )
      end
    
    # Particle at lowest energy = best response
    winner = Enum.min_by(result.particles, & &1.energy)
    
    # Return response + explanation
    %{
      response: find_response(responses, winner.id),
      explanation: generate_explanation(winner, field, result),
      score: winner.energy,
      force_diagram: visualize_forces(winner, field)
    }
  end
  
  defp generate_explanation(winner, field, result) do
    """
    Selected Response #{winner.id} because:
    
    Force Balance:
    - Accuracy attractor: +#{field.accuracy.strength} (strong pull)
    - Cost repulsor: #{-field.cost.strength} (moderate push)
    - Novelty attractor: +#{field.novelty.strength} (weak pull)
    - Latency repulsor: #{-field.latency.strength} (weak push)
    
    Net Score: #{winner.energy}
    
    Particle settled at position #{inspect(winner.position)}
    after #{result.iterations} relaxation steps.
    """
  end
end
```

**Usage:**
```elixir
responses = [
  LLM.generate(gpt4, prompt),
  LLM.generate(claude, prompt),
  LLM.generate(gemini, prompt)
]

objectives = %{
  accuracy: 0.9,   # Very important
  cost: -0.6,      # Moderately avoid expensive
  novelty: 0.4,    # Somewhat prefer creative
  latency: -0.2    # Slightly prefer fast
}

result = LLMSelector.select_best(prompt, responses, objectives)

IO.puts(result.response.text)
IO.puts("\n" <> result.explanation)
```

**Output:**
```
[Response text from Claude]

Selected Response 2 because:

Force Balance:
- Accuracy attractor: +0.9 (strong pull)
- Cost repulsor: -0.6 (moderate push)
- Novelty attractor: +0.4 (weak pull)
- Latency repulsor: -0.2 (weak push)

Net Score: 0.87

Particle settled at position {4.2, 3.1, 5.8}
after 23 relaxation steps.
```

---

## Part 4: Under the Hood - Technical Details

### 4.1 Type System

**PXVM-Script uses a physics-aware type system:**

```elixir
# Conserved types cannot be created/destroyed
@type conserved(T) :: %Conserved{value: T, quantity: float()}

# Vector types have magnitude + direction
@type vec3 :: %Vector{x: float(), y: float(), z: float()}

# Force types have strength + direction
@type force :: %Force{direction: vec3(), magnitude: float()}

# Graph types track topology
@type graph(T) :: %Graph{
  nodes: [%Node{id: any(), data: T, position: vec3()}],
  edges: [%Edge{from: id, to: id, weight: float()}]
}
```

**Compile-time checks:**

```elixir
# Error: Can't create conserved quantity from nothing
defphysics bad_example() do
  conserving [:energy] do
    # Compiler error: Where does energy come from?
    x = Conserved.new(:energy, 100.0)
  end
end

# OK: Transfer conserved quantity
defphysics good_example(input_energy) do
  conserving [:energy] do
    # OK: Energy input = energy output
    output_energy = transform(input_energy)
  end
end
```

---

### 4.2 Compiler Optimizations

**The PXVM-Script compiler applies physics-aware optimizations:**

#### **Force Fusion**
```elixir
# Before optimization
attracted_to(:goal1, strength: 0.5)
attracted_to(:goal2, strength: 0.5)

# After optimization (fused into single force calculation)
attracted_to([:goal1, :goal2], strength: 0.5)
```

#### **Lazy Evaluation**
```elixir
# Only evaluate forces that affect outcome
if temperature < 0.1 do
  # At low temperature, distant forces don't matter
  # Compiler skips force calculations beyond radius
  nearby_forces_only(radius: 10.0)
end
```

#### **GPU Kernel Fusion**
```elixir
# Instead of 3 separate GPU dispatches:
# 1. Compute forces
# 2. Integrate positions
# 3. Update velocities

# Fused into single kernel:
# Does all 3 in one GPU call (3× faster)
```

---

### 4.3 Debugging & Visualization

**PXVM-Script provides physics debugging tools:**

```elixir
# Enable physics tracing
config :pxvm, trace: :verbose

defphysics example(data) do
  # Trace shows:
  # - Force vectors at each step
  # - Energy over time
  # - Temperature changes
  # - Conservation violations
  
  result = optimize(data)
  
  # Get physics trace
  trace = PhysicsContext.get_trace()
  
  # Visualize in browser
  PhysicsViz.show(trace)
end
```

**Output:** Interactive 3D visualization showing:
- Particle trajectories
- Force field vectors
- Energy landscape
- Convergence plot

---

### 4.4 Performance Characteristics

**When PXVM-Script is fast:**
- ✅ Large graphs (1000+ nodes) → GPU shines
- ✅ Iterative optimization → Batching helps
- ✅ Multi-objective problems → Force superposition is elegant
- ✅ Real-time re-planning → GPU gives <100ms decisions

**When PXVM-Script is slow:**
- ❌ Small problems (<100 nodes) → GPU overhead dominates
- ❌ Single-shot calculations → Batching doesn't help
- ❌ Sequential logic → No parallelism to exploit
- ❌ Precise numerical calculations → Fixed-point adds overhead

**Rule of thumb:**
- **CPU path:** Fast for N < 1000
- **GPU path:** Fast for N > 1000
- **Breakeven:** ~500-1000 nodes

---

## Part 5: Philosophy & Design Principles

### 5.1 Why Physics?

**Physics is a universal optimization language:**

1. **Intuitive** - Everyone understands gravity, springs, repulsion
2. **Parallel** - Forces act independently, can compute in parallel
3. **Stable** - Physics simulations converge to equilibrium
4. **Explainable** - Force diagrams show why decisions were made
5. **Multi-objective** - Forces naturally superpose

**Example: Multi-objective optimization**

Traditional approach:
```python
score = w1*obj1 + w2*obj2 + w3*obj3
# How to choose weights? Trial and error!
```

Physics approach:
```elixir
# Forces just add up (superposition)
total_force = force1 + force2 + force3
# Natural balancing point emerges
```

---

### 5.2 Design Philosophy

**Core principles:**

1. **Declarative over Imperative**
   - Say what you want, not how to get it
   - Let physics figure out the path

2. **Correctness over Performance**
   - CPU fallback is deterministic
   - GPU is opt-in acceleration
   - Conservation checked at compile time

3. **Explainability over Black Boxes**
   - Every decision has force diagram
   - Trace shows why outcome occurred
   - Reproducible (given same forces)

4. **Composability over Monoliths**
   - Forces compose (superposition)
   - Graphs compose (union)
   - Constraints compose (intersection)

---

### 5.3 When to Use PXVM-Script

**Good fit:**
- ✅ Multi-objective optimization
- ✅ Adaptive/learning systems
- ✅ Explainable AI decisions
- ✅ Creative generation with control
- ✅ Real-time re-planning
- ✅ Graph/network problems

**Poor fit:**
- ❌ CRUD web apps
- ❌ Database queries
- ❌ String processing
- ❌ Sequential business logic
- ❌ Deterministic algorithms
- ❌ Small-scale calculations

**Sweet spot:** Problems where you're balancing tradeoffs and need to explain why.

---

## Part 6: Comparison to Other Approaches

### 6.1 vs. Traditional Optimization

| Approach | PXVM-Script | CPLEX/Gurobi | Genetic Algorithms | LLM-based |
|----------|-------------|--------------|-------------------|-----------|
| **Speed** | Fast (GPU) | Slow (minutes) | Very slow (hours) | Fast |
| **Explainability** | ✅ Forces | ⚠️ Dual variables | ❌ Black box | ❌ Black box |
| **Multi-objective** | ✅ Native | ⚠️ Weighted sum | ✅ Pareto | ❌ Single prompt |
| **Real-time** | ✅ <100ms | ❌ Minutes | ❌ Hours | ✅ Seconds |
| **Deterministic** | ✅ Yes | ✅ Yes | ❌ Stochastic | ❌ Stochastic |
| **Learning curve** | Medium | Hard | Medium | Easy |

---

### 6.2 vs. Other Physics-Based Systems

| Feature | PXVM-Script | Unity Physics | PhysX | Bullet |
|---------|-------------|---------------|-------|--------|
| **Domain** | General programming | Game engines | Game engines | Game engines |
| **Forces as code** | ✅ Native | ❌ Manual | ❌ Manual | ❌ Manual |
| **Temperature** | ✅ Native | ❌ N/A | ❌ N/A | ❌ N/A |
| **Conservation types** | ✅ Type system | ❌ N/A | ❌ N/A | ❌ N/A |
| **GPU backend** | ✅ Vulkan | ✅ CUDA | ✅ CUDA | ⚠️ OpenCL |
| **Purpose** | Optimization | Rigid bodies | Rigid bodies | Rigid bodies |

**Key difference:** PXVM-Script is for **computation**, not **simulation**.

---

## Part 7: Getting Started

### 7.1 Installation

```bash
# Add to mix.exs
def deps do
  [
    {:pxvm_script, "~> 0.1.0"}
  ]
end

# Install
mix deps.get

# Verify GPU support
mix pxvm.info
```

### 7.2 Hello World

```elixir
# hello.exs
use PXVMScript

defphysics hello_world() do
  IO.puts("Position: #{inspect(physics_context.position)}")
  IO.puts("Temperature: #{physics_context.temperature}")
end

hello_world()
```

**Output:**
```
Position: {0.0, 0.0, 0.0}
Temperature: 0.5
```

### 7.3 First Real Program

```elixir
# optimizer.exs
use PXVMScript

defmodule SimpleOptimizer do
  defphysics find_best(candidates, objectives) do
    # Attract to objectives, repel from constraints
    
    for {name, strength} <- objectives do
      if strength > 0 do
        attracted_to(name, strength: strength)
      else
        repelled_by(name, strength: abs(strength))
      end
    end
    
    # Let physics find equilibrium
    result = GraphPhysics.embed(candidates, 
      backend: :auto,
      iterations: 50
    )
    
    # Return best candidate
    Enum.min_by(result.particles, & &1.energy)
  end
end

# Try it
candidates = [
  %{id: 1, quality: 0.9, cost: 100},
  %{id: 2, quality: 0.7, cost: 50},
  %{id: 3, quality: 0.8, cost: 75}
]

objectives = %{quality: 0.8, cost: -0.6}

best = SimpleOptimizer.find_best(candidates, objectives)
IO.inspect(best)
```

---

## Conclusion

**PXVM-Script in one sentence:**

> A programming language that treats computation as physics—functions are particles, objectives are forces, and the GPU finds optimal solutions through physical simulation.

**Key innovations:**
1. ⚡ **Force fields as language primitives** (unique)
2. 🌡️ **Temperature control for exploration** (unique)
3. 🔒 **Conservation as type system** (unique)
4. 🚀 **GPU auto-dispatch** (rare but not unique)
5. 📊 **Force-based explainability** (unique)

**Best for:**
- Multi-objective AI optimization
- Adaptive learning systems
- Creative generation with physics
- Explainable decision-making
- Real-time re-planning

**Try it:** https://opensentience.org

---

*This explanation was generated for OpenSentience.org to help people understand PXVM-Script at different levels of depth.*
