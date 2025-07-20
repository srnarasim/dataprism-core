# DataPrism Product Requirements Prompt (PRP) Generation Guide

## Overview

This guide provides comprehensive instructions for creating Product Requirements Prompts (PRPs) within the DataPrism ecosystem. PRPs serve as detailed technical specifications for implementing new features, integrations, and capabilities across the multi-repository architecture.

## DataPrism Architecture Context

### Multi-Repository Structure

DataPrism follows a distributed architecture across four specialized repositories:

- **dataprism-core**: Hybrid Rust/WASM + TypeScript orchestration engine
- **dataprism-plugins**: Interface-based plugin framework with security sandboxing  
- **dataprism-apps**: Documentation-as-code and React demo applications
- **dataprism-tooling**: CLI-first development toolchain with multi-provider deployment

### Repository Responsibilities

#### dataprism-core
- **Core Engine**: Rust WebAssembly analytics engine with DuckDB integration
- **Orchestration**: TypeScript coordination layer for browser APIs
- **Performance**: <2s query response, <6MB WASM bundles, <5s initialization
- **Integration Points**: Plugin system interfaces, external service connections

#### dataprism-plugins  
- **Plugin Framework**: IPlugin interfaces and specialized extensions
- **Security**: Sandboxing, permissions, resource quotas
- **Plugin Types**: Data processors, visualizations, integrations, utilities
- **Distribution**: Multi-format bundles for CDN and npm distribution

#### dataprism-apps
- **Documentation**: Comprehensive guides, tutorials, and API reference
- **Demonstrations**: Interactive React applications showcasing capabilities
- **Examples**: Progressive complexity from basic usage to advanced patterns
- **Integration**: CDN-based DataPrism loading with performance monitoring

#### dataprism-tooling
- **CLI Tools**: Project scaffolding, building, deployment automation
- **Templates**: Complete project templates for all repository types
- **Deployment**: Multi-provider deployment (GitHub Pages, Cloudflare, Netlify, Vercel)
- **Validation**: Environment checking, security enforcement, build verification

## PRP Structure Template

### 1. Header and Metadata

```markdown
# [Feature Name] Integration for DataPrism

**Type**: [Plugin | Core Enhancement | Documentation | Tooling]
**Complexity**: [Low | Medium | High | Very High]
**Estimated Timeline**: [1-2 weeks | 3-4 weeks | 1-2 months | 2+ months]
**Primary Repository**: [dataprism-core | dataprism-plugins | dataprism-apps | dataprism-tooling]
**Dependencies**: [List of required repositories and external dependencies]
```

### 2. Problem Statement and Goals

```markdown
## Problem Statement

[Clear description of the problem or opportunity]

## Goals and Objectives

1. **Primary Goal**: [Main objective]
2. **Secondary Goals**: 
   - [Supporting objective 1]
   - [Supporting objective 2]
3. **Success Criteria**:
   - [Measurable outcome 1]
   - [Measurable outcome 2]
```

### 3. Architecture Design

```markdown
## Architecture Overview

### Repository Distribution

- **dataprism-core**: [What core changes/interfaces are needed]
- **dataprism-plugins**: [What plugins will be implemented]
- **dataprism-apps**: [What documentation/examples will be created]
- **dataprism-tooling**: [What tooling support is needed]

### Integration Points

[Detailed description of how components interact across repositories]

### Performance Considerations

- **Memory Impact**: [Expected memory usage]
- **Performance Targets**: [Specific performance requirements]
- **Bundle Size**: [Impact on CDN bundle sizes]
```

### 4. Technical Specifications

```markdown
## Core Implementation (dataprism-core)

### Rust WASM Components
[Detailed Rust implementations if needed]

### TypeScript Orchestration
[TypeScript integration and coordination logic]

### API Interfaces
[New or modified interfaces for the feature]

## Plugin Implementation (dataprism-plugins)

### Plugin Interface
[Specific plugin interface implementation]

### Security Considerations
[Security requirements and sandboxing needs]

### Resource Management
[Resource quotas and performance limits]

## Documentation and Examples (dataprism-apps)

### Documentation Structure
[Required documentation sections and guides]

### Interactive Demos
[Demo applications and interactive examples]

### Code Examples
[Progressive complexity examples from basic to advanced]

## Tooling Support (dataprism-tooling)

### CLI Integration
[Command-line tools and automation needed]

### Build System Changes
[Build process modifications]

### Deployment Considerations
[CDN distribution and deployment requirements]
```

### 5. Implementation Plan

```markdown
## Implementation Phases

### Phase 1: Core Foundation
- [ ] [Specific core tasks]
- [ ] [Interface definitions]
- [ ] [Basic implementation]

### Phase 2: Plugin Development  
- [ ] [Plugin interface implementation]
- [ ] [Security integration]
- [ ] [Testing and validation]

### Phase 3: Documentation and Examples
- [ ] [Documentation creation]
- [ ] [Demo application updates]
- [ ] [Progressive examples]

### Phase 4: Tooling Integration
- [ ] [CLI tool updates]
- [ ] [Build system integration]
- [ ] [Deployment automation]

### Phase 5: Testing and Validation
- [ ] [Comprehensive testing]
- [ ] [Performance validation]
- [ ] [Security audit]
- [ ] [Documentation review]
```

### 6. Testing Strategy

```markdown
## Testing Requirements

### Unit Testing
- **dataprism-core**: [Rust and TypeScript unit tests]
- **dataprism-plugins**: [Plugin framework and individual plugin tests]
- **dataprism-apps**: [React component and integration tests]
- **dataprism-tooling**: [CLI command and deployment tests]

### Integration Testing
- **Cross-Repository**: [Multi-repository integration scenarios]
- **Plugin System**: [Plugin loading and execution tests]
- **CDN Loading**: [CDN distribution and loading tests]

### Performance Testing
- **Memory Usage**: [Memory consumption validation]
- **Query Performance**: [Analytical query performance benchmarks]
- **Load Testing**: [CDN and initialization performance]

### Security Testing
- **Plugin Sandboxing**: [Security boundary validation]
- **Permission System**: [Access control testing]
- **Input Validation**: [Security input validation]
```

### 7. Documentation Requirements

```markdown
## Documentation Deliverables

### API Documentation
- [ ] TypeScript interface documentation
- [ ] Rust function documentation  
- [ ] Plugin API reference
- [ ] Integration guide

### User Guides
- [ ] Getting started guide
- [ ] Advanced usage patterns
- [ ] Troubleshooting guide
- [ ] Performance optimization guide

### Developer Documentation
- [ ] Architecture overview
- [ ] Development setup guide
- [ ] Contributing guidelines
- [ ] Testing procedures

### Examples and Tutorials
- [ ] Basic usage example
- [ ] Intermediate integration example
- [ ] Advanced customization example
- [ ] Performance optimization example
```

## PRP Quality Checklist

### Architecture Compliance
- [ ] Follows multi-repository architecture principles
- [ ] Proper separation of concerns across repositories
- [ ] Clear integration points and interfaces defined
- [ ] Security considerations addressed appropriately

### Technical Completeness
- [ ] Detailed implementation specifications provided
- [ ] Performance requirements clearly defined
- [ ] Testing strategy comprehensive and measurable
- [ ] Documentation requirements complete

### Implementation Feasibility
- [ ] Realistic timeline and effort estimates
- [ ] Dependencies clearly identified and manageable
- [ ] Resource requirements within ecosystem constraints
- [ ] Integration complexity appropriately scoped

### Quality Assurance
- [ ] Success criteria are measurable and specific
- [ ] Testing coverage addresses all critical paths
- [ ] Security implications properly evaluated
- [ ] Performance impact quantified and acceptable

## Example PRPs

For reference examples of well-structured PRPs, see:

- `ironcalc-formula-engine.md` - Complex plugin integration with core extensions
- `advanced-visualization-plugins.md` - Multi-plugin development
- `ai-powered-query-assistant.md` - LLM integration with security considerations
- `real-time-collaboration.md` - Cross-repository feature with complex integration

## PRP Review Process

### Initial Review
1. **Architecture Compliance**: Verify proper repository distribution
2. **Technical Feasibility**: Validate implementation approach
3. **Resource Estimation**: Confirm timeline and effort estimates
4. **Dependencies**: Verify all dependencies are manageable

### Technical Review
1. **Security Analysis**: Evaluate security implications
2. **Performance Impact**: Assess performance and resource impact
3. **Integration Complexity**: Validate cross-repository integration
4. **Testing Coverage**: Confirm comprehensive testing strategy

### Final Approval
1. **Implementation Plan**: Validate detailed implementation phases
2. **Documentation Requirements**: Confirm comprehensive documentation plan
3. **Success Criteria**: Verify measurable success metrics
4. **Maintenance Plan**: Confirm long-term maintenance considerations

## Best Practices

### Architecture Design
- Always consider the impact across all four repositories
- Design for modularity and loose coupling
- Prioritize security and performance from the start
- Plan for comprehensive testing and validation

### Implementation Planning
- Break complex features into manageable phases
- Identify critical dependencies early
- Plan for iterative development and testing
- Consider maintenance and long-term support

### Documentation Strategy
- Create documentation alongside implementation
- Provide examples at multiple complexity levels
- Include troubleshooting and common issues
- Maintain consistency across all repositories

### Quality Assurance
- Define clear, measurable success criteria
- Plan comprehensive testing from the beginning
- Include security and performance validation
- Document all assumptions and design decisions

This guide ensures that all DataPrism PRPs follow consistent patterns, maintain architectural integrity, and provide sufficient detail for successful implementation across the multi-repository ecosystem.