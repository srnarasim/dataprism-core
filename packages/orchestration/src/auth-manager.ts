import {
  CloudProvider,
  CloudCredentials,
  ProviderConfig,
  CloudStorageError
} from './types.js';

interface TokenInfo {
  token: string;
  expiresAt: number;
  refreshToken?: string;
  scopes?: string[];
}

interface AuthConfig {
  tokenRefreshThreshold: number; // Refresh when this many ms before expiry
  maxRetries: number;
  retryDelay: number;
}

export class AuthManager {
  private credentials: Map<CloudProvider, CloudCredentials> = new Map();
  private tokens: Map<CloudProvider, TokenInfo> = new Map();
  private config: AuthConfig;

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = {
      tokenRefreshThreshold: 300000, // 5 minutes
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
  }

  setCredentials(provider: CloudProvider, credentials: CloudCredentials): void {
    this.credentials.set(provider, { ...credentials });
    
    // Clear any existing tokens when credentials change
    this.tokens.delete(provider);
  }

  getCredentials(provider: CloudProvider): CloudCredentials | null {
    return this.credentials.get(provider) || null;
  }

  async getAuthHeaders(provider: CloudProvider, config?: ProviderConfig): Promise<Record<string, string>> {
    const credentials = this.credentials.get(provider);
    if (!credentials) {
      return {};
    }

    const authMethod = config?.authMethod || 'api-key';

    switch (authMethod) {
      case 'api-key':
        return this.getApiKeyHeaders(provider, credentials);
      
      case 'oauth2':
        return await this.getOAuth2Headers(provider, credentials);
      
      case 'iam-role':
        return await this.getIAMHeaders(provider, credentials);
      
      default:
        throw new CloudStorageError(
          `Unsupported auth method: ${authMethod}`,
          provider,
          'UNSUPPORTED_AUTH_METHOD'
        );
    }
  }

  async refreshTokenIfNeeded(provider: CloudProvider): Promise<boolean> {
    const tokenInfo = this.tokens.get(provider);
    if (!tokenInfo) {
      return false;
    }

    const now = Date.now();
    const shouldRefresh = now + this.config.tokenRefreshThreshold >= tokenInfo.expiresAt;

    if (shouldRefresh && tokenInfo.refreshToken) {
      try {
        await this.refreshOAuth2Token(provider, tokenInfo.refreshToken);
        return true;
      } catch (error) {
        console.warn(`Failed to refresh token for ${provider}:`, error);
        this.tokens.delete(provider);
        return false;
      }
    }

    return false;
  }

  clearCredentials(provider?: CloudProvider): void {
    if (provider) {
      this.credentials.delete(provider);
      this.tokens.delete(provider);
    } else {
      this.credentials.clear();
      this.tokens.clear();
    }
  }

  validateCredentials(provider: CloudProvider, credentials: CloudCredentials): boolean {
    switch (provider) {
      case 'aws-s3':
        return Boolean(
          credentials.accessKeyId && 
          credentials.secretAccessKey
        );
      
      case 'cloudflare-r2':
        return Boolean(credentials.apiKey);
      
      case 'google-cloud-storage':
        return Boolean(
          credentials.oauth2Token || 
          (credentials.accessKeyId && credentials.secretAccessKey)
        );
      
      case 'azure-blob':
        return Boolean(
          credentials.apiKey || 
          credentials.oauth2Token
        );
      
      default:
        return false;
    }
  }

  async testAuthentication(provider: CloudProvider): Promise<{
    isValid: boolean;
    error?: string;
  }> {
    try {
      const headers = await this.getAuthHeaders(provider);
      
      // For testing, we would need to make a simple API call
      // This is a placeholder implementation
      if (Object.keys(headers).length === 0) {
        return {
          isValid: false,
          error: 'No authentication headers generated'
        };
      }

      // TODO: Implement actual test calls to each provider
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown authentication error'
      };
    }
  }

  private getApiKeyHeaders(provider: CloudProvider, credentials: CloudCredentials): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (provider) {
      case 'aws-s3':
        if (credentials.accessKeyId && credentials.secretAccessKey) {
          // AWS Signature Version 4 would be implemented here
          // This is a simplified placeholder
          headers['Authorization'] = this.createAWSSignature(credentials);
        }
        break;

      case 'cloudflare-r2':
        if (credentials.apiKey) {
          headers['X-Auth-Key'] = credentials.apiKey;
          if (credentials.accessKeyId) {
            headers['X-Auth-Email'] = credentials.accessKeyId; // R2 uses email as identifier
          }
        }
        break;

      case 'google-cloud-storage':
        if (credentials.apiKey) {
          headers['Authorization'] = `Bearer ${credentials.apiKey}`;
        }
        break;

      case 'azure-blob':
        if (credentials.apiKey) {
          headers['Authorization'] = `Bearer ${credentials.apiKey}`;
        }
        break;
    }

    return headers;
  }

  private async getOAuth2Headers(provider: CloudProvider, credentials: CloudCredentials): Promise<Record<string, string>> {
    let token = credentials.oauth2Token;

    // Check if we have a cached valid token
    const tokenInfo = this.tokens.get(provider);
    if (tokenInfo && Date.now() < tokenInfo.expiresAt) {
      token = tokenInfo.token;
    } else if (tokenInfo && tokenInfo.refreshToken) {
      // Try to refresh the token
      try {
        token = await this.refreshOAuth2Token(provider, tokenInfo.refreshToken);
      } catch (error) {
        console.warn(`Failed to refresh OAuth2 token for ${provider}:`, error);
      }
    }

    if (!token) {
      throw new CloudStorageError(
        'No valid OAuth2 token available',
        provider,
        'NO_OAUTH2_TOKEN'
      );
    }

    return {
      'Authorization': `Bearer ${token}`
    };
  }

  private async getIAMHeaders(provider: CloudProvider, credentials: CloudCredentials): Promise<Record<string, string>> {
    // IAM role authentication is typically handled by the environment
    // This would involve metadata service calls in cloud environments
    
    if (provider === 'aws-s3') {
      // In a real implementation, this would:
      // 1. Check for instance metadata service
      // 2. Retrieve temporary credentials
      // 3. Generate proper AWS signatures
      
      if (credentials.sessionToken) {
        return {
          'Authorization': this.createAWSSignature(credentials),
          'X-Amz-Security-Token': credentials.sessionToken
        };
      }
    }

    return {};
  }

  private createAWSSignature(credentials: CloudCredentials): string {
    // This is a simplified placeholder for AWS Signature Version 4
    // In a real implementation, this would:
    // 1. Create canonical request
    // 2. Create string to sign
    // 3. Calculate signature
    // 4. Return proper authorization header
    
    return `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/...`;
  }

  private async refreshOAuth2Token(provider: CloudProvider, refreshToken: string): Promise<string> {
    // This would make actual HTTP requests to refresh OAuth2 tokens
    // Implementation depends on the provider's OAuth2 endpoint
    
    const tokenEndpoints: Record<CloudProvider, string> = {
      'aws-s3': '', // AWS doesn't use OAuth2 typically
      'cloudflare-r2': '', // R2 uses API keys
      'google-cloud-storage': 'https://oauth2.googleapis.com/token',
      'azure-blob': 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    };

    const endpoint = tokenEndpoints[provider];
    if (!endpoint) {
      throw new Error(`OAuth2 refresh not supported for ${provider}`);
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData = await response.json();
      
      // Cache the new token
      this.tokens.set(provider, {
        token: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        refreshToken: tokenData.refresh_token || refreshToken,
        scopes: tokenData.scope?.split(' ')
      });

      return tokenData.access_token;
    } catch (error) {
      throw new CloudStorageError(
        `Failed to refresh OAuth2 token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider,
        'TOKEN_REFRESH_FAILED'
      );
    }
  }

  getTokenInfo(provider: CloudProvider): TokenInfo | null {
    return this.tokens.get(provider) || null;
  }

  isTokenExpired(provider: CloudProvider): boolean {
    const tokenInfo = this.tokens.get(provider);
    if (!tokenInfo) {
      return true;
    }
    return Date.now() >= tokenInfo.expiresAt;
  }

  getProvidersWithCredentials(): CloudProvider[] {
    return Array.from(this.credentials.keys());
  }

  getAuthStats(): Record<CloudProvider, {
    hasCredentials: boolean;
    hasToken: boolean;
    tokenExpired: boolean;
  }> {
    const stats: Record<string, any> = {};
    
    const allProviders: CloudProvider[] = ['aws-s3', 'cloudflare-r2', 'google-cloud-storage', 'azure-blob'];
    
    for (const provider of allProviders) {
      stats[provider] = {
        hasCredentials: this.credentials.has(provider),
        hasToken: this.tokens.has(provider),
        tokenExpired: this.isTokenExpired(provider)
      };
    }
    
    return stats as Record<CloudProvider, any>;
  }
}