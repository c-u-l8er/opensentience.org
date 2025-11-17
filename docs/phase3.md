# OPEN Project Development Guide
## Phase 3: Ash Platform Integration

**Duration:** 4 weeks (Weeks 7-10)  
**Focus:** Integrate Ash Framework for platform features  
**Goal:** Add persistence, APIs, and multi-tenancy while keeping execution fast

---

## 3.1 Phase Overview

### Objectives

Wrap the pure DAG engine with **Ash Framework** to add:
- Database persistence for DAG definitions
- Execution history and tracking
- User management and authentication
- GraphQL/REST APIs (auto-generated)
- Authorization and multi-tenancy
- Real-time subscriptions

### Success Criteria

- ✓ DAGs stored and versioned in database
- ✓ Execution history queryable
- ✓ GraphQL API functional
- ✓ User authentication working
- ✓ Execution performance unchanged (<0.2ms added overhead)
- ✓ Multi-tenant isolation verified

### Critical Constraint

**Ash MUST NOT be on the execution hot path**
- DAG execution stays pure Elixir
- Ash only for management and tracking
- Async updates to avoid blocking

---

## 3.2 Architecture Design

### Hybrid Architecture

```
┌─────────────────────────────────────────────┐
│         ASH PLATFORM LAYER                  │
│     (open_platform application)             │
│                                             │
│  Resources:                                 │
│  ├── Open.Platform.DAG                     │
│  ├── Open.Platform.Execution               │
│  ├── Open.Platform.User                    │
│  └── Open.Platform.Organization            │
│                                             │
│  API:                                       │
│  ├── GraphQL (AshGraphql)                  │
│  ├── REST (JSON:API)                       │
│  └── Realtime (Subscriptions)              │
└──────────────┬──────────────────────────────┘
               │
               │ Orchestrator Bridge
               │
┌──────────────▼──────────────────────────────┐
│         PURE DAG RUNTIME                    │
│     (open_core - no changes)                │
│                                             │
│  • Macro-based DAG definition              │
│  • Fast execution (<0.1ms overhead)        │
│  • OTP supervision                         │
│  • No database dependencies                │
└─────────────────────────────────────────────┘
```

### Data Flow

```
1. User Creates DAG (via GraphQL):
   GraphQL mutation
   → Ash validation
   → Store in Postgres
   → Return DAG ID
   [15ms total - acceptable]

2. User Executes DAG:
   GraphQL mutation
   → Create Execution record (status: pending)
   → Compile DAG definition to module
   → Spawn execution task
   → Return Execution ID immediately
   [20ms - doesn't block execution]

3. Execution Happens (Pure):
   Compiled module executes
   → Pure DAG runtime (no Ash)
   → Results collected
   [100ms for 1000 nodes - unchanged]

4. Status Updates (Async):
   Background process
   → Update execution record
   → Trigger GraphQL subscription
   [5ms - async, doesn't slow execution]
```

---

## 3.3 Ash Resources Design

### Resource 1: DAG

**Purpose:** Store and version DAG definitions

**Attributes:**
- `id` - UUID primary key
- `name` - String, unique per org
- `description` - Text
- `definition` - Map (JSON), stores node structure
- `status` - Enum [:draft, :active, :archived]
- `version` - Integer, auto-incremented
- `organization_id` - UUID, belongs_to
- `created_by` - UUID, user reference
- `inserted_at` / `updated_at` - Timestamps

**Relationships:**
- belongs_to :organization
- belongs_to :creator, User
- has_many :executions
- has_many :versions, DAGVersion

**Actions:**
- create :new - Create new DAG
- read :list - List user's DAGs
- read :get - Get single DAG
- update :update_definition - Update DAG structure
- update :activate - Mark as active
- update :archive - Archive old version
- destroy :delete - Soft delete

**Validations:**
- Name present and unique
- Definition is valid DAG structure
- No cycles in definition
- All node names unique

**Policies:**
- Users can read DAGs in their organization
- Creators can update their DAGs
- Admins can manage all DAGs

---

### Resource 2: Execution

**Purpose:** Track DAG execution history and status

**Attributes:**
- `id` - UUID primary key
- `dag_id` - UUID, belongs_to
- `status` - Enum [:pending, :running, :success, :failed, :cancelled]
- `started_at` - UTC DateTime
- `completed_at` - UTC DateTime
- `context` - Map, input parameters
- `result` - Map, execution results
- `error_message` - Text
- `retry_count` - Integer, default 0
- `triggered_by` - UUID, user reference
- `metadata` - Map, arbitrary metadata

**Relationships:**
- belongs_to :dag
- belongs_to :triggered_by, User
- has_many :node_executions

**Calculations:**
- duration - completed_at - started_at
- success_rate - percentage of successful nodes

**Aggregates:**
- total_nodes - count of node_executions
- failed_nodes - count where status = failed
- avg_node_duration - average node execution time

**Actions:**
- create :start - Begin new execution
- read :list - List executions with filters
- read :get - Get execution with details
- update :complete - Mark as completed
- update :fail - Mark as failed
- update :cancel - Cancel running execution

**Policies:**
- Users can see executions of their DAGs
- System can update execution status
- Admins can view all executions

---

### Resource 3: NodeExecution

**Purpose:** Track individual node execution within DAG run

**Attributes:**
- `id` - UUID
- `execution_id` - UUID, belongs_to
- `node_name` - String
- `status` - Enum [:pending, :running, :success, :failed]
- `started_at` - UTC DateTime
- `completed_at` - UTC DateTime
- `result` - Map
- `error` - Text
- `retry_count` - Integer

**Relationships:**
- belongs_to :execution

**Actions:**
- create :start
- update :complete
- update :fail

**Purpose:**
- Debugging failed executions
- Performance analysis per node
- Identifying bottlenecks

---

### Resource 4: User

**Purpose:** User authentication and profile

**Attributes:**
- `id` - UUID
- `email` - String, unique
- `hashed_password` - String
- `name` - String
- `role` - Enum [:user, :admin]
- `organization_id` - UUID
- `last_sign_in` - UTC DateTime

**Relationships:**
- belongs_to :organization
- has_many :created_dags, DAG
- has_many :triggered_executions, Execution

**Authentication:**
- Uses AshAuthentication
- Password strategy
- Token-based API auth

**Actions:**
- create :register
- read :get_current_user
- update :update_profile
- update :change_password

---

### Resource 5: Organization

**Purpose:** Multi-tenancy and team management

**Attributes:**
- `id` - UUID
- `name` - String, unique
- `slug` - String, unique
- `settings` - Map
- `compute_quota` - Integer (CPU hours)
- `storage_quota` - Integer (GB)

**Relationships:**
- has_many :users
- has_many :dags

**Aggregates:**
- total_executions - count of all DAG executions
- compute_used - sum of execution durations

**Policies:**
- Users can only access their org's resources
- Admins can manage org settings

---

## 3.4 Orchestrator Bridge

### Purpose

Connect Ash management layer with pure DAG runtime without performance penalty.

### Design

```elixir
# Pseudocode structure (no actual code)

defmodule Open.Orchestrator
  # Bridges Ash and pure runtime
  
  def execute_dag(dag_id, user_id, context)
    # 1. Load DAG from Ash (one-time cost)
    # 2. Validate user permissions
    # 3. Create execution record (status: pending)
    # 4. Compile DAG definition to module
    # 5. Spawn execution task (async)
    # 6. Return execution ID immediately
    # 7. Monitor task and update status (background)
  end
  
  # Key: Execution happens in pure Elixir
  # Ash updates happen asynchronously
end
```

### Compilation Strategy

**Options Evaluated:**

1. **Runtime Compilation**
   - Compile DAG definition to module at execution time
   - Pro: Flexible, latest definition
   - Con: 50-100ms compilation overhead
   - **Decision:** Use this for now

2. **Pre-compilation**
   - Compile when DAG is activated
   - Store compiled BEAM bytecode
   - Pro: Zero execution-time compilation
   - Con: Complexity, versioning issues
   - **Decision:** Future optimization

3. **Interpretation**
   - Interpret definition at runtime
   - Pro: No compilation needed
   - Con: Slower execution
   - **Decision:** Not suitable

### Monitoring Strategy

**Async Updates:**
- Execution task runs independently
- Monitor process updates Ash records
- GraphQL subscriptions notify clients
- No blocking on database writes

**Update Frequency:**
- Status changes: Immediate
- Node completions: Batched (every 100ms)
- Final result: On completion

---

## 3.5 GraphQL API Design

### Schema Overview

```
type Query {
  # DAG queries
  dag(id: ID!): DAG
  dags(filters: DAGFilters): [DAG!]!
  
  # Execution queries
  execution(id: ID!): Execution
  executions(dagId: ID, filters: ExecutionFilters): [Execution!]!
  
  # User queries
  currentUser: User
}

type Mutation {
  # DAG mutations
  createDAG(input: CreateDAGInput!): DAG
  updateDAG(id: ID!, input: UpdateDAGInput!): DAG
  activateDAG(id: ID!): DAG
  archiveDAG(id: ID!): DAG
  
  # Execution mutations
  executeDAG(dagId: ID!, context: JSON): Execution
  cancelExecution(id: ID!): Execution
  
  # Auth mutations
  signIn(email: String!, password: String!): AuthResult
  signOut: Boolean
}

type Subscription {
  # Real-time execution updates
  executionUpdated(executionId: ID!): Execution
  nodeExecutionUpdated(executionId: ID!): NodeExecution
}
```

### Key Endpoints

**1. Create DAG**
```
mutation CreateDAG {
  createDAG(input: {
    name: "Data Pipeline"
    description: "ETL workflow"
    definition: {
      nodes: [
        {name: "extract", dependencies: []}
        {name: "transform", dependencies: ["extract"]}
        {name: "load", dependencies: ["transform"]}
      ]
    }
  }) {
    id
    name
    status
  }
}
```

**2. Execute DAG**
```
mutation ExecuteDAG {
  executeDAG(
    dagId: "uuid-here"
    context: {input_path: "/data/raw"}
  ) {
    id
    status
    startedAt
  }
}
```

**3. Subscribe to Execution**
```
subscription OnExecutionUpdate {
  executionUpdated(executionId: "uuid-here") {
    id
    status
    completedAt
    result
  }
}
```

---

## 3.6 Implementation Approach

### Week 7: Ash Setup & Core Resources

**Deliverables:**
- Install Ash dependencies
- Configure AshPostgres
- Implement DAG resource
- Implement Execution resource
- Database migrations

**Key Tasks:**
- Set up Ash API module
- Design database schema
- Write resource definitions
- Test CRUD operations

**Success Criteria:**
- Can create DAG via Ash
- DAG stored in database
- Can query DAGs
- Validations working

---

### Week 8: Authentication & Authorization

**Deliverables:**
- User resource
- Organization resource
- AshAuthentication integration
- Policy definitions
- Multi-tenant isolation

**Key Tasks:**
- Set up authentication
- Define authorization policies
- Test access controls
- Implement org scoping

**Success Criteria:**
- Users can sign in
- Policies enforced
- Can't access other org data
- Password reset works

---

### Week 9: GraphQL API

**Deliverables:**
- AshGraphql integration
- Complete schema
- Subscriptions working
- API documentation

**Key Tasks:**
- Configure Absinthe
- Define GraphQL schema
- Set up subscriptions
- Test with GraphQL client

**Success Criteria:**
- All CRUD operations via GraphQL
- Subscriptions deliver updates
- API documented
- Playground accessible

---

### Week 10: Orchestrator & Integration

**Deliverables:**
- Orchestrator module
- DAG compilation
- Execution monitoring
- End-to-end tests

**Key Tasks:**
- Build orchestrator bridge
- Implement compilation
- Set up async monitoring
- Performance testing

**Success Criteria:**
- Can execute DAG via API
- Execution tracked in database
- Performance target met (<0.2ms overhead)
- Real-time updates working

---

## 3.7 Performance Considerations

### Must Preserve

**Core Engine Performance:**
- <0.1ms task overhead maintained
- 100K+ concurrent tasks still supported
- OTP supervision unchanged
- Memory footprint similar

### Acceptable Overhead

**Platform Layer:**
- 15ms to create DAG (one-time)
- 20ms to start execution (returns immediately)
- 5ms per async status update (background)

### Monitoring

**Metrics to Track:**
- DAG creation time
- Execution start latency
- Status update frequency
- Database query times
- GraphQL response times

---

## 3.8 Testing Strategy

### Integration Tests

**Scenarios:**

1. **DAG Lifecycle**
   - Create via GraphQL
   - Update definition
   - Activate
   - Execute
   - Query results

2. **Multi-Tenancy**
   - Create orgs and users
   - Verify isolation
   - Test cross-org access denied

3. **Execution Tracking**
   - Start execution
   - Monitor status updates
   - Verify node tracking
   - Check final results

4. **Fault Scenarios**
   - Database connection lost
   - Execution fails
   - Verify error handling

### Performance Tests

**Benchmarks:**

1. **DAG Creation**
   - Measure insert time
   - Target: <15ms

2. **Execution Start**
   - From API call to task spawned
   - Target: <20ms

3. **Status Updates**
   - Background update latency
   - Target: <5ms per update

4. **Query Performance**
   - List 1000 DAGs
   - Get execution with nodes
   - Target: <50ms

---

## 3.9 Migration Strategy

### Database Migrations

**Schema Changes:**
- Create DAGs table
- Create Executions table
- Create NodeExecutions table
- Create Users table
- Create Organizations table

**Indexes:**
- DAGs: organization_id, name, status
- Executions: dag_id, status, started_at
- Users: email, organization_id

**Constraints:**
- Foreign keys with cascades
- Unique indexes
- Check constraints

---

## 3.10 Documentation Updates

### API Documentation

**GraphQL:**
- Auto-generated schema docs
- Example queries/mutations
- Authentication guide
- Subscription examples

### Integration Guide

**Topics:**
- How Ash wraps core engine
- Performance characteristics
- When to use Orchestrator
- Custom resource extensions

---

## 3.11 Success Checklist

### Technical

- [ ] All Ash resources implemented
- [ ] GraphQL API functional
- [ ] Authentication working
- [ ] Authorization policies enforced
- [ ] Multi-tenancy verified
- [ ] Subscriptions delivering updates
- [ ] Performance targets met
- [ ] Integration tests passing

### Documentation

- [ ] API reference complete
- [ ] Integration guide published
- [ ] Migration guide written
- [ ] Performance characteristics documented

---

## 3.12 Next Steps

### Phase 3 Exit Criteria

**Must Have:**
- Full CRUD via GraphQL
- Execution tracking working
- Auth and multi-tenancy functional
- Performance validated

**Phase 4 Preview:**
- Phoenix LiveView dashboards
- Visual DAG editor
- Real-time monitoring UI
- User-friendly interface

---

**Phase 3 Status:** Ready After Phase 2  
**Duration:** 4 weeks  
**Prepared by:** OPEN Core Team