# Generate Product Requirements Prompt (PRP) for DataPrism Core

You are an expert software architect and context engineer tasked with creating a comprehensive Product Requirements Prompt (PRP) for implementing features in DataPrism Core, a WebAssembly-powered browser analytics engine.

## Your Mission

Read the feature request file provided in $ARGUMENTS and create a detailed PRP that an AI coding assistant can use to implement the feature successfully. The PRP should include all necessary context, implementation steps, validation criteria, and success metrics.

## Research Phase

Before creating the PRP, research the codebase to understand:

1. **Architecture Patterns**: How existing components are structured
2. **Code Conventions**: Naming, organization, and style patterns
3. **Integration Points**: How different layers interact
4. **Performance Patterns**: Optimization strategies used
5. **Error Handling**: How errors are managed across language boundaries

## PRP Structure

Create a comprehensive PRP with the following sections:

### 1. Executive Summary

- Brief description of the feature
- Primary objectives and success criteria
- Architecture layer affected (Core WASM, Orchestration, LLM, Plugins)

### 2. Context and Background

- Current state of the system
- Why this feature is needed
- How it fits into the overall DataPrism Core architecture

### 3. Technical Specifications

- Detailed technical requirements
- Performance targets and constraints
- Browser compatibility requirements
- Security considerations

### 4. Implementation Plan

Break down the implementation into clear, manageable phases:

- **Phase 1**: Core feature implementation
- **Phase 2**: Integration with existing systems  
- **Phase 3**: Error handling and validation
- **Phase 4**: Advanced features and optimization
- **Phase 5**: Deployment and documentation (REQUIRED)
  - CDN bundle preparation and GitHub Pages deployment
  - Comprehensive documentation updates
  - CDN integration testing

### 5. Code Examples and Patterns

Include specific code examples for:

- WebAssembly-JavaScript interop patterns
- DuckDB integration patterns
- Error handling across language boundaries
- Memory management strategies

### 6. Testing Strategy

- Unit tests for all public APIs
- Integration tests for cross-language interactions
- Performance benchmarks
- Browser compatibility tests
- Error scenario testing
- **CDN integration testing** (REQUIRED)
- **Documentation example validation** (REQUIRED)

### 7. Success Criteria

- Functional requirements met
- Performance targets achieved
- All tests passing
- Code review approval
- **Documentation complete and validated** (REQUIRED)
- **CDN deployment successful** (REQUIRED)
- **All documentation examples tested and working** (REQUIRED)

### 8. Validation Commands

Include specific commands to validate the implementation:

```bash
# Build commands
npm run build
npm run build:core
wasm-pack build packages/core

# CDN build commands (REQUIRED)
npm run build:cdn:[feature-name]
npm run bundle:[feature-name] --env=production

# Test commands
npm test
npm run test:integration
npm run test:performance
npm run test:cdn-integration (REQUIRED)
npm run test:docs-examples (REQUIRED)

# Lint and quality checks
npm run lint
npm run type-check
cargo clippy

# Validation commands (REQUIRED)
npm run validate:cdn-deployment
npm run validate:documentation
npm run validate:docs-examples
```

## DataPrism Core Specific Considerations

### WebAssembly Integration

- Use wasm-bindgen for JavaScript interop
- Implement proper memory management
- Handle serialization/deserialization efficiently
- Optimize for browser memory constraints

### DuckDB Integration

- Use Arrow format for data exchange
- Implement proper connection lifecycle management
- Handle query optimization
- Manage large dataset processing


### Performance Requirements

- Query response time: <2 seconds for 95% of operations
- Memory usage: <4GB for 1M row datasets
- Initialization time: <5 seconds
- Browser compatibility: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## Quality Assurance

The PRP should include:

- Clear acceptance criteria
- Comprehensive testing strategy
- Performance benchmarks
- Security review checklist
- **Documentation requirements** (REQUIRED)
- **CDN deployment pipeline** (REQUIRED)
- **GitHub Pages integration** (REQUIRED)

## Output Format

Save the PRP as `PRPs/[feature-name].md` with:

- Clear, actionable steps
- Comprehensive context
- Specific validation criteria
- Code examples and patterns
- Success metrics

## Final Validation

Before completing, ensure the PRP:

1. Addresses all requirements from the feature request
2. Includes sufficient context for implementation
3. Provides clear validation criteria
4. Follows DataPrism Core architecture patterns
5. Includes comprehensive testing strategy
6. **Contains Phase 5: Deployment and Documentation** (REQUIRED)
7. **Includes CDN deployment pipeline with GitHub Pages** (REQUIRED)
8. **Contains comprehensive documentation updates** (REQUIRED)
9. **Includes CDN integration testing strategy** (REQUIRED)
10. **Contains documentation example validation** (REQUIRED)

## Required Sections for All PRPs

Every PRP MUST include these sections:

### Deployment Requirements
- CDN bundle preparation
- GitHub Pages deployment pipeline
- Version management and rollback strategies
- Performance monitoring and validation

### Documentation Requirements  
- API reference documentation
- Integration guides and tutorials
- Troubleshooting guides
- Plugin developer documentation updates
- All code examples must be tested and validated

### CDN Integration Testing
- Load testing from CDN
- Performance benchmarks for CDN-loaded features
- Cross-browser compatibility testing
- Fallback mechanism testing

Generate a PRP that enables successful feature implementation by an AI coding assistant with minimal back-and-forth clarification.
