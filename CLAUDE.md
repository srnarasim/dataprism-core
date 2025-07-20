# DataPrism Core - Context Engineering Guide

## Project Overview

DataPrism Core is a WebAssembly-powered browser analytics engine that combines DuckDB for high-performance data processing with LLM integration for intelligent analysis. The project follows a hybrid architecture approach with Rust/C++ for the core WASM engine and TypeScript/JavaScript for orchestration.

## Architecture Context

DataPrism Core implements a sophisticated hybrid language architecture combining Rust WebAssembly with TypeScript orchestration:

### Core Architecture Patterns
- **Hybrid WASM/TypeScript**: Rust WASM core with TypeScript orchestration layer
- **DataPrismEngine**: Primary orchestrator for dependency management and lifecycle
- **DuckDBManager**: High-performance analytical backend with Arrow format support
- **DependencyRegistry**: Asynchronous dependency loading with health monitoring

### Performance Architecture
- **Memory Management**: <6MB WASM modules, <4GB for 1M row datasets
- **Query Performance**: <2s response time for 95% of analytical queries
- **Initialization**: <5s engine startup with CDN-optimized loading
- **Browser Support**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

### Repository Structure
```
dataprism-core/
├── packages/
│   ├── src/                    # Rust WASM core
│   ├── orchestration/          # TypeScript orchestration
│   └── pkg/                    # wasm-pack output
├── dist/                       # CDN-ready bundles
├── tests/                      # Integration tests
├── docs/                       # Architecture documentation
└── PRPs/                       # Product Requirements Prompts
```

## Core Technologies

- **Primary Languages**: Rust (WASM core), TypeScript/JavaScript (orchestration)
- **Database**: DuckDB-WASM for analytical processing
- **Build Tools**: wasm-pack, webpack, cargo
- **Testing**: Jest for JavaScript, Rust's built-in test framework
- **Documentation**: TypeDoc for API documentation

## Development Principles

### Code Organization

- Keep WASM modules under 6MB for optimal loading
- Use clear module boundaries between Rust and JavaScript
- Implement proper error handling across language boundaries
- Follow WebAssembly best practices for memory management

### Performance Guidelines

- Target <2 seconds for 95% of analytical queries
- Memory usage <4GB for 1M row datasets
- Initialization time <5 seconds for engine startup
- Optimize for browser memory constraints

### Testing Requirements

- Unit tests for all public APIs
- Integration tests for WASM-JavaScript interactions
- Performance benchmarks for core operations
- Browser compatibility testing across major browsers

### Documentation Standards

- TSDoc comments for all public TypeScript interfaces
- Rust documentation for all public functions
- README files for each major component
- Code examples for all public APIs

## Context Engineering Rules

### Planning and Research

- Always read existing code before implementing new features
- Check for similar implementations in examples/ directory
- Review requirements documents and implementation plans
- Understand the broader architecture before making changes

### Code Structure

- Files should be under 500 lines when possible
- Use clear, descriptive names for functions and variables
- Implement proper error handling and logging
- Follow established patterns in the codebase

### WebAssembly Specific Guidelines

- Use wasm-bindgen for JavaScript interop
- Implement proper memory management in Rust
- Handle WebAssembly compilation errors gracefully
- Use appropriate data types for cross-language communication

### DuckDB Integration

- Use Arrow format for efficient data transfer
- Implement proper connection lifecycle management
- Handle query errors and timeouts appropriately
- Optimize for analytical workloads

### LLM Integration

- Implement proper rate limiting and error handling
- Use intelligent caching to reduce API calls
- Support multiple LLM providers through abstraction
- Handle context window limitations gracefully

## Common Patterns to Follow

### Error Handling

```rust
// Rust WASM error handling
#[wasm_bindgen]
pub struct DataPrismError {
    message: String,
    error_type: String,
}

#[wasm_bindgen]
impl DataPrismError {
    pub fn new(message: &str, error_type: &str) -> DataPrismError {
        DataPrismError {
            message: message.to_string(),
            error_type: error_type.to_string(),
        }
    }
}
```

### TypeScript Interface Design

```typescript
// TypeScript interface patterns
export interface QueryResult<T = any> {
  data: T[];
  metadata: QueryMetadata;
  error?: DataPrismError;
}

export interface QueryMetadata {
  rowCount: number;
  executionTime: number;
  memoryUsage: number;
}
```

### Memory Management

```rust
// Rust memory management pattern
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct DataBuffer {
    data: Vec<u8>,
}

#[wasm_bindgen]
impl DataBuffer {
    pub fn new(size: usize) -> DataBuffer {
        DataBuffer {
            data: Vec::with_capacity(size),
        }
    }

    pub fn get_ptr(&self) -> *const u8 {
        self.data.as_ptr()
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }
}
```

## Build and Testing Context

```bash
# Build WASM core
wasm-pack build packages/src --target web --out-dir ../pkg

# Build orchestration layer
npm run build:orchestration

# Build CDN bundles
npm run build:bundles

# Run tests
cargo test                    # Rust unit tests
npm run test:orchestration    # TypeScript tests
npm run test:integration      # Integration tests
npm run test:performance      # Performance benchmarks
```

## Performance Monitoring

- Monitor WebAssembly module load times
- Track memory usage patterns
- Measure query execution performance
- Monitor API response times

## Security Considerations

- Implement proper input validation
- Use Content Security Policy compliance
- Handle sensitive data securely
- Implement proper authentication for LLM APIs

## Communication Style

- Be direct and technical when discussing implementation details
- Provide concrete code examples when suggesting solutions
- Explain trade-offs and alternatives when relevant
- Ask clarifying questions about requirements when needed
