use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub struct CloudDataRequest {
    url: String,
    method: String,
}

#[wasm_bindgen]
impl CloudDataRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(url: String, method: String) -> CloudDataRequest {
        CloudDataRequest { url, method }
    }

    #[wasm_bindgen(getter)]
    pub fn url(&self) -> String {
        self.url.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn method(&self) -> String {
        self.method.clone()
    }
}

#[wasm_bindgen]
pub struct CloudDataResponse {
    data: Vec<u8>,
    status: u16,
    provider: String,
}

#[wasm_bindgen]
impl CloudDataResponse {
    #[wasm_bindgen(constructor)]
    pub fn new(data: Vec<u8>, status: u16, provider: String) -> CloudDataResponse {
        CloudDataResponse {
            data,
            status,
            provider,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn data(&self) -> js_sys::Uint8Array {
        js_sys::Uint8Array::from(&self.data[..])
    }

    #[wasm_bindgen(getter)]
    pub fn status(&self) -> u16 {
        self.status
    }

    #[wasm_bindgen(getter)]
    pub fn provider(&self) -> String {
        self.provider.clone()
    }
}

#[wasm_bindgen]
pub struct CloudStorageBridge {
    js_http_client: js_sys::Function,
    request_cache: HashMap<String, CloudDataResponse>,
}

#[wasm_bindgen]
impl CloudStorageBridge {
    #[wasm_bindgen(constructor)]
    pub fn new(http_client_fn: js_sys::Function) -> CloudStorageBridge {
        console_log!("Initializing CloudStorageBridge");
        CloudStorageBridge {
            js_http_client: http_client_fn,
            request_cache: HashMap::new(),
        }
    }

    #[wasm_bindgen]
    pub async fn fetch_cloud_data(&mut self, url: &str) -> Result<js_sys::Uint8Array, JsValue> {
        console_log!("Fetching cloud data from: {}", url);

        // Check cache first
        if let Some(cached) = self.request_cache.get(url) {
            console_log!("Using cached data for: {}", url);
            return Ok(cached.data());
        }

        // Call JavaScript HTTP client from WASM
        let options = js_sys::Object::new();
        js_sys::Reflect::set(
            &options,
            &JsValue::from_str("method"),
            &JsValue::from_str("GET"),
        )?;

        let promise =
            self.js_http_client
                .call2(&JsValue::NULL, &JsValue::from_str(url), &options)?;

        let response = wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(promise)).await?;

        // Extract response data
        let array_buffer = js_sys::Reflect::get(&response, &JsValue::from_str("arrayBuffer"))?;
        let array_buffer_fn = js_sys::Function::from(array_buffer);
        let buffer_promise = array_buffer_fn.call0(&response)?;
        let buffer =
            wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(buffer_promise)).await?;

        let uint8_array = js_sys::Uint8Array::new(&buffer);
        let data: Vec<u8> = uint8_array.to_vec();

        // Cache the response
        let status = js_sys::Reflect::get(&response, &JsValue::from_str("status"))?
            .as_f64()
            .unwrap_or(200.0) as u16;
        let provider = self.detect_provider(url);

        let cached_response = CloudDataResponse::new(data.clone(), status, provider);

        self.request_cache.insert(url.to_string(), cached_response);

        Ok(js_sys::Uint8Array::from(&data[..]))
    }

    #[wasm_bindgen]
    pub async fn fetch_cloud_metadata(&self, url: &str) -> Result<JsValue, JsValue> {
        console_log!("Fetching cloud metadata from: {}", url);

        let options = js_sys::Object::new();
        js_sys::Reflect::set(
            &options,
            &JsValue::from_str("method"),
            &JsValue::from_str("HEAD"),
        )?;

        let promise =
            self.js_http_client
                .call2(&JsValue::NULL, &JsValue::from_str(url), &options)?;

        let response = wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(promise)).await?;

        // Extract metadata
        let metadata = js_sys::Object::new();
        let status = js_sys::Reflect::get(&response, &JsValue::from_str("status"))?;
        let headers = js_sys::Reflect::get(&response, &JsValue::from_str("headers"))?;

        js_sys::Reflect::set(&metadata, &JsValue::from_str("status"), &status)?;
        js_sys::Reflect::set(&metadata, &JsValue::from_str("headers"), &headers)?;
        js_sys::Reflect::set(
            &metadata,
            &JsValue::from_str("provider"),
            &JsValue::from_str(&self.detect_provider(url)),
        )?;

        Ok(metadata.into())
    }

    #[wasm_bindgen]
    pub fn clear_cache(&mut self) {
        console_log!("Clearing cloud storage cache");
        self.request_cache.clear();
    }

    #[wasm_bindgen]
    pub fn get_cache_size(&self) -> usize {
        self.request_cache.len()
    }

    #[wasm_bindgen]
    pub fn get_cached_urls(&self) -> js_sys::Array {
        let array = js_sys::Array::new();
        for url in self.request_cache.keys() {
            array.push(&JsValue::from_str(url));
        }
        array
    }

    #[wasm_bindgen]
    pub async fn stream_cloud_data(
        &self,
        url: &str,
        chunk_size: usize,
    ) -> Result<js_sys::Array, JsValue> {
        console_log!(
            "Streaming cloud data from: {} with chunk size: {}",
            url,
            chunk_size
        );

        // For streaming, we'll fetch the data and split it into chunks
        // In a real implementation, this would use HTTP range requests
        let options = js_sys::Object::new();
        js_sys::Reflect::set(
            &options,
            &JsValue::from_str("method"),
            &JsValue::from_str("GET"),
        )?;

        let promise =
            self.js_http_client
                .call2(&JsValue::NULL, &JsValue::from_str(url), &options)?;

        let response = wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(promise)).await?;

        let array_buffer = js_sys::Reflect::get(&response, &JsValue::from_str("arrayBuffer"))?;
        let array_buffer_fn = js_sys::Function::from(array_buffer);
        let buffer_promise = array_buffer_fn.call0(&response)?;
        let buffer =
            wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(buffer_promise)).await?;

        let uint8_array = js_sys::Uint8Array::new(&buffer);
        let data: Vec<u8> = uint8_array.to_vec();

        // Split data into chunks
        let chunks = js_sys::Array::new();
        for chunk in data.chunks(chunk_size) {
            let chunk_array = js_sys::Uint8Array::from(chunk);
            chunks.push(&chunk_array);
        }

        Ok(chunks)
    }

    fn detect_provider(&self, url: &str) -> String {
        let url_lower = url.to_lowercase();

        if url_lower.contains("amazonaws.com") || url_lower.contains("s3.") {
            "aws-s3".to_string()
        } else if url_lower.contains("r2.dev") || url_lower.contains("r2.cloudflarestorage.com") {
            "cloudflare-r2".to_string()
        } else if url_lower.contains("googleapis.com")
            || url_lower.contains("storage.cloud.google.com")
        {
            "google-cloud-storage".to_string()
        } else if url_lower.contains("blob.core.windows.net") {
            "azure-blob".to_string()
        } else {
            "unknown".to_string()
        }
    }
}

// Helper struct for managing cloud data buffers
#[wasm_bindgen]
pub struct CloudDataBuffer {
    data: Vec<u8>,
    source_url: String,
    provider: String,
}

#[wasm_bindgen]
impl CloudDataBuffer {
    #[wasm_bindgen(constructor)]
    pub fn new(data: Vec<u8>, url: String, provider: String) -> CloudDataBuffer {
        CloudDataBuffer {
            data,
            source_url: url,
            provider,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn data(&self) -> js_sys::Uint8Array {
        js_sys::Uint8Array::from(&self.data[..])
    }

    #[wasm_bindgen(getter)]
    pub fn length(&self) -> usize {
        self.data.len()
    }

    #[wasm_bindgen(getter)]
    pub fn source_url(&self) -> String {
        self.source_url.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn provider(&self) -> String {
        self.provider.clone()
    }

    #[wasm_bindgen]
    pub fn slice(&self, start: usize, end: usize) -> js_sys::Uint8Array {
        let end = end.min(self.data.len());
        let start = start.min(end);
        js_sys::Uint8Array::from(&self.data[start..end])
    }
}

// Automatic cleanup when buffer is dropped
impl Drop for CloudDataBuffer {
    fn drop(&mut self) {
        console_log!("Cleaning up cloud data buffer for {}", self.source_url);
    }
}
