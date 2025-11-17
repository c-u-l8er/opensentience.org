# DAG Computational Model for Supercomputing in Elixir

A powerful, macro-based DSL for defining and executing Directed Acyclic Graph (DAG) computations in Elixir. Built for high-performance scientific computing, data processing, and machine learning pipelines with automatic parallelization and optimization.

## Features

- 🚀 **Compile-time DAG Definition** - Define computational graphs using clean, declarative macros
- ⚡ **Automatic Parallelization** - Independent nodes execute in parallel automatically
- 🔄 **Dependency Resolution** - Topological sorting ensures correct execution order
- 🛡️ **Cycle Detection** - Compile-time validation prevents cyclic dependencies
- 📊 **Multiple Execution Strategies** - Sequential, parallel, and distributed execution
- 🎯 **Zero-cost Abstractions** - Macro-based implementation with minimal runtime overhead
- 📈 **Visualization** - Generate GraphViz diagrams of your computation graphs
- 🧮 **Optimized for Scientific Computing** - Designed for matrix operations, simulations, and data pipelines

## Installation

Add `dag_compute` to your `mix.exs`:

```elixir
def deps do
  [
    {:dag_compute, "~> 0.1.0"}
  ]
end
```

## Quick Start

### Basic Example

```elixir
defmodule MyPipeline do
  use DagCompute
  
  dag :process_data do
    node :load, [] do
      # Load data - no dependencies
      {:ok, load_dataset()}
    end
    
    node :clean, [:load] do
      # Clean depends on load
      data = get(:load)
      clean_data(data)
    end
    
    node :analyze, [:clean] do
      # Analyze depends on clean
      data = get(:clean)
      run_analysis(data)
    end
  end
end

# Execute the DAG
result = MyPipeline.execute_process_data()
```

### Parallel Execution (Diamond Pattern)

```elixir
dag :parallel_features do
  node :data, [] do
    load_dataset()
  end
  
  # These two nodes can run in parallel
  node :feature_a, [:data] do
    extract_feature_a(get(:data))
  end
  
  node :feature_b, [:data] do
    extract_feature_b(get(:data))
  end
  
  # Waits for both features
  node :combine, [:feature_a, :feature_b] do
    merge(get(:feature_a), get(:feature_b))
  end
end
```

## Core Concepts

### DAG Definition

Use the `dag/2` macro to define a computational graph:

```elixir
dag :my_computation do
  # nodes go here
end
```

### Node Definition

Nodes are computation units with explicit dependencies:

```elixir
node :node_name, [:dependency1, :dependency2] do
  # computation code
  # use get(:dependency1) to access dependency results
end
```

### Accessing Dependencies

Use the `get/1` macro within a node to access results from dependencies:

```elixir
node :process, [:fetch] do
  data = get(:fetch)
  transform(data)
end
```

## Execution Strategies

### Sequential Execution

Executes nodes one at a time in topological order:

```elixir
MyPipeline.execute_process_data(strategy: :sequential)
```

### Parallel Execution (Default)

Automatically parallelizes independent nodes:

```elixir
MyPipeline.execute_process_data(strategy: :parallel)
MyPipeline.execute_process_data(strategy: :parallel, max_concurrency: 8)
```

### Distributed Execution

Distribute computation across multiple nodes:

```elixir
MyPipeline.execute_process_data(
  strategy: :distributed,
  nodes: [node1@host, node2@host],
  supervisor: MySupervisor
)
```

## Advanced Features

### Visualization

Generate GraphViz DOT format for your DAGs:

```elixir
dot_output = MyPipeline.visualize_process_data()
File.write!("pipeline.dot", dot_output)

# Then render with: dot -Tpng pipeline.dot -o pipeline.png
```

### Execution Levels

The runtime automatically groups nodes into execution levels based on dependencies:

```
Level 0: [node_a, node_b]          # No dependencies, run in parallel
Level 1: [node_c]                  # Depends on node_a
Level 2: [node_d, node_e]          # Depend on node_c, run in parallel
Level 3: [node_f]                  # Depends on node_d and node_e
```

### Cycle Detection

The runtime automatically detects cycles at execution time:

```elixir
dag :invalid do
  node :a, [:b] do
    :value_a
  end
  
  node :b, [:a] do  # Creates a cycle!
    :value_b
  end
end

# Raises: RuntimeError "Cycle detected in DAG: [:a, :b, :a]"
```

## Real-World Examples

### Scientific Data Pipeline

```elixir
defmodule SciencePipeline do
  use DagCompute
  
  dag :experiment do
    node :load_data, [] do
      read_experimental_data()
    end
    
    node :normalize, [:load_data] do
      get(:load_data) |> normalize_values()
    end
    
    node :compute_stats, [:normalize] do
      data = get(:normalize)
      %{
        mean: Statistics.mean(data),
        std: Statistics.std(data)
      }
    end
    
    node :detect_outliers, [:normalize, :compute_stats] do
      data = get(:normalize)
      stats = get(:compute_stats)
      
      threshold = stats.mean + 2 * stats.std
      Enum.filter(data, &(&1 > threshold))
    end
    
    node :generate_report, [:compute_stats, :detect_outliers] do
      # Generate final report
      create_report(get(:compute_stats), get(:detect_outliers))
    end
  end
end
```

### Parallel Monte Carlo Simulation

```elixir
defmodule MonteCarlo do
  use DagCompute
  
  dag :simulation do
    # Create 100 independent simulation batches
    for batch <- 1..100 do
      node :"batch_#{batch}", [] do
        run_simulation_batch(batch, iterations: 10_000)
      end
    end
    
    # Aggregate all results
    node :aggregate, for(i <- 1..100, do: :"batch_#{i}") do
      results = for i <- 1..100, do: get(:"batch_#{i}")
      compute_statistics(results)
    end
    
    node :confidence_interval, [:aggregate] do
      stats = get(:aggregate)
      calculate_95_ci(stats)
    end
  end
end
```

### Machine Learning Pipeline

```elixir
dag :ml_pipeline do
  node :load_training_data, [] do
    load_dataset("training.csv")
  end
  
  # Parallel feature extraction
  node :text_features, [:load_training_data] do
    extract_text_features(get(:load_training_data))
  end
  
  node :numerical_features, [:load_training_data] do
    extract_numerical_features(get(:load_training_data))
  end
  
  node :interaction_features, [:load_training_data] do
    compute_interactions(get(:load_training_data))
  end
  
  # Merge all features
  node :merge_features, [:text_features, :numerical_features, :interaction_features] do
    combine_features(
      get(:text_features),
      get(:numerical_features),
      get(:interaction_features)
    )
  end
  
  # Parallel model training and validation
  node :train_model, [:merge_features] do
    train_gradient_boosting(get(:merge_features))
  end
  
  node :cross_validate, [:merge_features] do
    k_fold_cv(get(:merge_features), k: 5)
  end
  
  node :evaluate, [:train_model, :cross_validate] do
    generate_evaluation_report(
      get(:train_model),
      get(:cross_validate)
    )
  end
end
```

## Performance Considerations

### When to Use Parallel Execution

Parallel execution shines when you have:
- **Independent computations** (diamond patterns)
- **CPU-intensive operations** that can run concurrently
- **I/O-bound operations** that benefit from concurrent execution
- **Multiple data sources** that can be fetched simultaneously

### Optimal Concurrency Levels

```elixir
# Default: 2x number of schedulers
execute_my_dag(strategy: :parallel)

# Custom concurrency
execute_my_dag(strategy: :parallel, max_concurrency: 16)

# For CPU-bound: cores * 1-2
# For I/O-bound: cores * 2-4
max_concurrency: System.schedulers_online() * 2
```

### Benchmarking

```elixir
# Compare strategies
{seq_time, seq_result} = :timer.tc(fn ->
  MyPipeline.execute_process_data(strategy: :sequential)
end)

{par_time, par_result} = :timer.tc(fn ->
  MyPipeline.execute_process_data(strategy: :parallel)
end)

speedup = seq_time / par_time
IO.puts("Speedup: #{Float.round(speedup, 2)}x")
```

## Limitations and Future Work

### Current Limitations
- No automatic memoization/caching between executions
- No dynamic DAG modification at runtime
- Limited optimization passes (fusion, etc.)

### Planned Features
- [ ] Persistent result caching
- [ ] Cost-based query optimization
- [ ] GPU computation support
- [ ] Streaming/incremental execution
- [ ] Automatic checkpoint/recovery
- [ ] Performance profiling integration
- [ ] Resource quota management

## Architecture

### Compile-Time Processing
1. **Macro Expansion** - `dag` and `node` macros expand to module attributes
2. **Validation** - Collect all nodes and edges
3. **Code Generation** - Generate `execute_*` and `visualize_*` functions

### Runtime Execution
1. **Validation** - Check for cycles using DFS
2. **Topological Sort** - Order nodes using Kahn's algorithm
3. **Level Computation** - Group nodes by execution level
4. **Parallel Execution** - Execute each level's nodes concurrently
5. **Result Aggregation** - Merge results into context map

## Contributing

Contributions welcome! Areas of interest:
- Additional optimization passes
- More execution strategies
- Enhanced visualization
- Performance benchmarks
- Real-world use cases

## License

MIT License - see LICENSE file for details

## Credits

Built with ❤️ using Elixir's powerful macro system for high-performance scientific computing.