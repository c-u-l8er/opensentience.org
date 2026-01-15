# OPEN Project Development Guide
## Phase 2: Core DAG Engine Development

**Duration:** 4 weeks (Weeks 3-6)  
**Focus:** Build the pure Elixir DAG execution engine  
**Goal:** Production-ready workflow orchestration without platform features

---

## 2.1 Phase Overview

### Objectives

Build a **pure Elixir DAG engine** that provides:
- Compile-time macro DSL for DAG definition
- Automatic dependency resolution & topological sorting
- Parallel execution with configurable strategies
- OTP-based fault tolerance & supervision
- Zero database dependencies (pure computation)

### Success Criteria

- ✓ Execute 100K+ concurrent tasks
- ✓ <0.1ms task scheduling overhead
- ✓ Automatic cycle detection
- ✓ Fault recovery in <200ms
- ✓ 80%+ test coverage
- ✓ Complete documentation

### Non-Goals (Deferred to Later Phases)

- Database storage (Phase 3)
- Web interface (Phase 4)
- Native workers (Phase 5)
- GraphQL API (Phase 3)

---

## 2.2 Architecture Design

### System Components

```
Core DAG Engine (open_core)
├── DSL Layer (Macros)
│   ├── dag/2 macro - Define DAG
│   ├── node/3 macro - Define computation node
│   └── get/1 macro - Access dependencies
│
├── Compilation Layer
│   ├── DAG validation (cycles, types)
│   ├── Code generation
│   └── Module compilation
│
├── Runtime Layer
│   ├── Topological sort
│   ├── Execution level computation
│   ├── Task scheduling
│   └── Result collection
│
└── Supervision Layer
    ├── Task supervisors
    ├── Fault detection
    ├── Automatic restart
    └── State recovery
```

### Execution Flow

```
1. Compile Time:
   User defines DAG with macros
   → Macro expansion & validation
   → Generate execute_* functions
   → Detect cycles, verify dependencies

2. Runtime:
   Call MyDAG.execute_workflow()
   → Topological sort nodes
   → Group into execution levels
   → Execute level by level
   → Collect results in context map

3. Fault Handling:
   Task crashes
   → Supervisor detects (50ms)
   → Restart task
   → Continue execution
```

---

## 2.3 Core Features

### Feature 1: Macro-Based DSL

**Purpose:** Compile-time DAG definition with safety guarantees

**Key Capabilities:**
- Declarative node definition
- Explicit dependency declaration
- Compile-time validation
- Type-safe context access

**Design Principles:**
- Zero runtime overhead for definition
- Clear error messages
- Natural Elixir syntax
- Composable nodes

**Non-Technical Example:**
Think of it like a recipe where you declare all steps and their dependencies upfront, and the computer checks if it makes sense before you start cooking.

---

### Feature 2: Dependency Resolution

**Purpose:** Automatically determine execution order

**Key Capabilities:**
- Topological sorting (Kahn's algorithm)
- Cycle detection (DFS)
- Level computation (longest path)
- Dependency validation

**Design Principles:**
- O(V+E) complexity maximum
- Clear error messages for cycles
- Deterministic ordering
- No hidden dependencies

**Non-Technical Example:**
Like a project manager figuring out which tasks can happen in parallel and which must wait for others to finish.

---

### Feature 3: Execution Strategies

**Purpose:** Flexible execution models for different workloads

**Strategies to Implement:**

1. **Sequential**
   - Execute one node at a time
   - Deterministic order
   - Easy debugging
   - Use case: Testing, small workflows

2. **Parallel**
   - Execute independent nodes concurrently
   - Configurable max concurrency
   - Level-by-level execution
   - Use case: I/O-bound, distributed work

3. **Streaming** (v1.1)
   - Process data in batches
   - Incremental results
   - Memory efficient
   - Use case: Large datasets

**Design Principles:**
- Strategy is a parameter, not hardcoded
- Same DAG works with all strategies
- Performance characteristics documented
- Easy to benchmark

---

### Feature 4: Fault Tolerance

**Purpose:** Automatic recovery from failures

**Key Capabilities:**
- OTP supervision trees
- Automatic task restart
- Configurable retry policies
- Partial result preservation

**Supervision Strategy:**
```
DagSupervisor (one_for_one)
├── ExecutionSupervisor (rest_for_one)
│   ├── LevelSupervisor (one_for_all)
│   │   ├── TaskWorker1
│   │   ├── TaskWorker2
│   │   └── TaskWorker3
│   └── ResultCollector
└── MonitorServer
```

**Recovery Scenarios:**

1. **Single Task Failure**
   - Supervisor detects crash
   - Restart task with same inputs
   - Update retry counter
   - Continue execution

2. **Level Failure**
   - Restart all tasks in level
   - Preserve results from previous levels
   - Log failure context

3. **Catastrophic Failure**
   - Stop execution
   - Report error
   - Allow manual intervention

**Design Principles:**
- Fail fast, recover fast
- Preserve partial progress
- Configurable retry limits
- Clear error reporting

---

## 2.4 Implementation Approach

### Week 3: DSL & Validation

**Deliverables:**
- `dag/2` and `node/3` macros working
- Compile-time attribute collection
- Basic validation (cycles, duplicates)
- Test suite for macro expansion

**Key Decisions:**
- Module attribute storage strategy
- Error message formatting
- Validation timing (compile vs runtime)

**Success Criteria:**
- Can define simple DAGs
- Cycle detection works
- Clear error messages
- Documentation examples

---

### Week 4: Execution Engine

**Deliverables:**
- Topological sort implementation
- Level computation algorithm
- Sequential execution working
- Context management

**Key Decisions:**
- Context data structure (Map vs struct)
- Result passing mechanism
- Error propagation strategy

**Success Criteria:**
- Linear DAGs execute correctly
- Results accessible to dependent nodes
- Performance acceptable (<1ms overhead)

---

### Week 5: Parallelization

**Deliverables:**
- Parallel execution strategy
- Task spawning & monitoring
- Concurrency control
- Level-based synchronization

**Key Decisions:**
- Task.async vs GenServer
- Max concurrency configuration
- Load balancing strategy

**Success Criteria:**
- Diamond DAGs run in parallel
- Configurable concurrency works
- No race conditions
- 10x speedup on I/O-bound work

---

### Week 6: Fault Tolerance & Polish

**Deliverables:**
- OTP supervision tree
- Retry logic
- Error handling
- Performance benchmarks
- Documentation

**Key Decisions:**
- Supervisor strategy (one_for_one vs rest_for_one)
- Retry policy defaults
- Logging strategy

**Success Criteria:**
- Tasks restart automatically
- Partial progress preserved
- <200ms recovery time
- 80%+ test coverage

---

## 2.5 Testing Strategy

### Unit Tests

**Coverage Required:** 80%+

**Test Categories:**

1. **Macro Tests**
   - DAG definition validates correctly
   - Cycles detected at compile time
   - Dependencies verified
   - Error messages clear

2. **Algorithm Tests**
   - Topological sort correctness
   - Level computation accuracy
   - Edge cases (empty DAG, single node)

3. **Execution Tests**
   - Results propagate correctly
   - Context management works
   - Errors handled properly

4. **Concurrency Tests**
   - No race conditions
   - Synchronization correct
   - Resource limits respected

### Integration Tests

**Scenarios:**

1. **Simple Linear Workflow**
   - 3 sequential nodes
   - Verify execution order
   - Check results

2. **Diamond Pattern**
   - 1 root, 2 parallel, 1 merge
   - Verify parallelization
   - Timing analysis

3. **Complex Graph**
   - 20+ nodes, multiple levels
   - Mixed dependencies
   - Performance profiling

4. **Failure Scenarios**
   - Node crashes
   - Timeout handling
   - Retry logic

### Performance Tests

**Benchmarks:**

1. **Task Overhead**
   - Measure scheduling overhead
   - Target: <0.1ms per task
   - Compare to raw Task.async

2. **Concurrency Scaling**
   - Test 10, 100, 1K, 10K, 100K tasks
   - Measure memory usage
   - Identify bottlenecks

3. **Fault Recovery Speed**
   - Time to detect failure
   - Time to restart
   - Target: <200ms total

---

## 2.6 Documentation Requirements

### API Documentation

**Modules to Document:**
- `Open.DAG` - Macro API
- `Open.Runtime` - Execution functions
- `Open.Validator` - Validation utilities

**Documentation Includes:**
- @moduledoc with overview
- @doc for all public functions
- @spec with types
- Examples with doctests

### User Guides

**Guides to Write:**

1. **Getting Started**
   - Installation
   - First DAG
   - Basic concepts

2. **DAG Definition**
   - Syntax guide
   - Node types
   - Dependencies

3. **Execution Strategies**
   - When to use each
   - Configuration options
   - Performance tips

4. **Error Handling**
   - Common errors
   - Debugging tips
   - Retry configuration

5. **Performance Tuning**
   - Benchmarking
   - Optimization strategies
   - Resource limits

---

## 2.7 Key Design Patterns

### Pattern 1: Compile-Time Validation

**Principle:** Catch errors before runtime

**Implementation:**
- Use module attributes to collect node definitions
- Validate in `__before_compile__` callback
- Generate functions only if valid
- Provide clear error messages

**Benefits:**
- Zero runtime validation overhead
- Impossible to execute invalid DAG
- Better developer experience

---

### Pattern 2: Immutable Context

**Principle:** Results never mutate, only accumulate

**Implementation:**
- Pass context as immutable Map
- Each node adds its result
- No shared mutable state
- Easy to reason about

**Benefits:**
- No race conditions
- Easy debugging
- Predictable behavior

---

### Pattern 3: Level-Based Execution

**Principle:** Execute all independent nodes in parallel

**Implementation:**
- Group nodes by dependency depth
- Execute each level fully before next
- Synchronize between levels
- No inter-level dependencies

**Benefits:**
- Maximum parallelism
- Simple synchronization
- Predictable resource usage

---

### Pattern 4: Supervision Hierarchy

**Principle:** Let it crash, recover automatically

**Implementation:**
- Supervisor per execution
- Task per node
- Automatic restart on failure
- Preserve partial results

**Benefits:**
- Built-in fault tolerance
- No defensive programming needed
- Graceful degradation

---

## 2.8 Performance Targets

### Latency Targets

| Metric | Target | Stretch Goal |
|--------|--------|--------------|
| Task scheduling overhead | <0.1ms | <0.05ms |
| Fault detection | <100ms | <50ms |
| Task restart | <100ms | <50ms |
| Level synchronization | <10ms | <5ms |

### Throughput Targets

| Metric | Target | Stretch Goal |
|--------|--------|--------------|
| Concurrent tasks | 100K | 1M |
| Tasks/second | 10K | 100K |
| Nodes in DAG | 1,000 | 10,000 |
| Execution levels | 100 | 500 |

### Resource Targets

| Metric | Target | Stretch Goal |
|--------|--------|--------------|
| Memory per task | <10KB | <5KB |
| CPU overhead | <5% | <2% |
| Process count | 100K+ | 1M+ |

---

## 2.9 Risks & Mitigations

### Risk 1: Performance Below Targets

**Probability:** Medium  
**Impact:** High

**Mitigation:**
- Early benchmarking (Week 4)
- Profile hot paths
- Optimize algorithms
- Consider native code for critical paths

**Contingency:**
- Reduce target to 50K concurrent tasks
- Focus on correctness over performance
- Optimize in later phase

---

### Risk 2: Macro Complexity

**Probability:** Medium  
**Impact:** Medium

**Mitigation:**
- Keep macro logic simple
- Extract complexity to runtime functions
- Test thoroughly
- Document extensively

**Contingency:**
- Simplify DSL if needed
- Trade convenience for simplicity
- Provide verbose but clear API

---

### Risk 3: Supervision Bugs

**Probability:** Low  
**Impact:** High

**Mitigation:**
- Use proven OTP patterns
- Test failure scenarios extensively
- Chaos engineering tests
- Review with OTP experts

**Contingency:**
- Simplify supervision tree
- Use more conservative strategies
- Defer advanced features

---

## 2.10 Success Checklist

### Technical Checklist

- [ ] DAG macro compiles successfully
- [ ] Cycle detection works
- [ ] Topological sort correct
- [ ] Sequential execution works
- [ ] Parallel execution works
- [ ] Fault recovery functional
- [ ] <0.1ms task overhead
- [ ] 100K+ concurrent tasks
- [ ] 80%+ test coverage
- [ ] No memory leaks

### Documentation Checklist

- [ ] API docs complete
- [ ] User guide written
- [ ] Examples tested
- [ ] Performance guide published
- [ ] Architecture documented

### Deliverables Checklist

- [ ] `open_core` app functional
- [ ] Test suite passing
- [ ] Benchmarks run successfully
- [ ] Demo workflows work
- [ ] Documentation site ready

---

## 2.11 Next Steps

### Phase 2 Exit Criteria

**Must Have:**
- Core engine functional
- Tests passing with 80%+ coverage
- Documentation complete
- Performance targets met
- Demo workflows successful

**Can Defer:**
- Advanced execution strategies
- Distributed execution
- Performance optimizations
- Additional features

### Transition to Phase 3

**Handoff:**
- Core engine stable and documented
- API surface finalized
- Performance characteristics known
- Integration points identified

**Phase 3 Preview:**
- Integrate Ash Framework
- Add database persistence
- Implement execution tracking
- Build GraphQL API

---

**Phase 2 Status:** Ready to Start  
**Next:** Begin Week 3 - DSL Development  
**Duration:** 4 weeks

**Prepared by:** OPEN Core Team  
**Date:** November 16, 2025  
**Version:** 1.0