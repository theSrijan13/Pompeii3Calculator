/**
 * Service for interacting with the ChannelAdvisor API
 * Handles authentication, token management, and API requests
 */
import { APPLICATION_ID, BASE_URL, REFRESH_TOKEN, SHARED_SECRET, TOKEN_ENDPOINT } from "@/config";

// Token storage - Note: In serverless environments like Vercel, 
// module-level variables don't persist between function invocations
let accessToken: string | null = null;
let tokenExpiry: number | null = null;

/**
 * Alternative token storage for serverless environments
 * In production, consider using Redis, database, or environment variables
 */
class TokenStorage {
    private static instance: TokenStorage;
    private token: string | null = null;
    private expiry: number | null = null;

    static getInstance(): TokenStorage {
        if (!TokenStorage.instance) {
            TokenStorage.instance = new TokenStorage();
        }
        return TokenStorage.instance;
    }

    setToken(token: string, expiresIn: number): void {
        this.token = token;
        this.expiry = Date.now() + (expiresIn * 1000);
        // Also set module-level variables for backward compatibility
        accessToken = token;
        tokenExpiry = this.expiry;
        console.log(`Token stored. Expires at: ${new Date(this.expiry).toISOString()}`);
    }

    getToken(): { token: string | null; expiry: number | null } {
        // Prefer module-level variables if available, fallback to instance
        const token = accessToken || this.token;
        const expiry = tokenExpiry || this.expiry;
        return { token, expiry };
    }

    clearToken(): void {
        this.token = null;
        this.expiry = null;
        accessToken = null;
        tokenExpiry = null;
        console.log("Token storage cleared");
    }

    isValid(): boolean {
        const { token, expiry } = this.getToken();
        if (!token || !expiry) return false;
        
        const now = Date.now();
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
        return now < (expiry - bufferTime);
    }
}

const tokenStorage = TokenStorage.getInstance();

/**
 * Checks if the current access token is valid and not expired
 * @returns {boolean} True if token is valid, false otherwise
 */
function isTokenValid(): boolean {
    const isValid = tokenStorage.isValid();
    
    if (!isValid) {
        const { token, expiry } = tokenStorage.getToken();
        if (!token || !expiry) {
            console.log("Token invalid: No token or expiry set");
        } else {
            console.log(`Token expired: Now=${new Date().toISOString()}, Expiry=${new Date(expiry).toISOString()}`);
        }
    }
    
    return isValid;
}

/**
 * Gets a valid access token, refreshing if necessary
 * @returns {Promise<string>} A valid access token
 */
async function getValidAccessToken(): Promise<string> {
    if (isTokenValid()) {
        const { token } = tokenStorage.getToken();
        console.log("Using existing valid token");
        return token!;
    }
    
    console.log("Token invalid or expired, refreshing...");
    return await refreshAccessToken();
}

/**
 * Refreshes the access token using the refresh token and credentials with retry logic
 * @param {number} retryCount - Number of retries attempted
 * @returns {string} The newly obtained access token
 * @throws {Error} If token refresh fails after all retries
 */
async function refreshAccessToken(retryCount: number = 0): Promise<string> {
    const maxRetries = 3;
    const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s

    console.log(`Starting token refresh process... (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    // --- START: Environment Variable Validation ---
    if (!APPLICATION_ID || !SHARED_SECRET || !REFRESH_TOKEN) {
        const missingVars = [];
        if (!APPLICATION_ID) missingVars.push('APPLICATION_ID');
        if (!SHARED_SECRET) missingVars.push('SHARED_SECRET');
        if (!REFRESH_TOKEN) missingVars.push('REFRESH_TOKEN');
        
        const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}. Please ensure they are set in your deployment environment (e.g., Vercel project settings).`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }
    // --- END: Environment Variable Validation ---

    // Use Node.js Buffer for base64 encoding instead of btoa (which is not available in Node.js)
    const authString = Buffer.from(`${APPLICATION_ID}:${SHARED_SECRET}`).toString('base64');
    
    // Manually build the URL-encoded string for the body
    const body = `grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}`;

    const options = {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + authString,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body,
    };

    try {
        console.log("Attempting to refresh access token...");
        console.log("TOKEN_ENDPOINT:", TOKEN_ENDPOINT);
        console.log("Request headers:", JSON.stringify(options.headers, null, 2));
        console.log("Request body length:", body.length);
        
        const response = await fetch(TOKEN_ENDPOINT, options);
        const responseText = await response.text();

        console.log(`Token refresh response status: ${response.status}`);
        console.log("Token refresh response headers:", JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
        
        if (response.ok) {
            try {
                const responseData = JSON.parse(responseText);
                if (responseData.access_token) {
                    console.log("Access token refreshed successfully.");
                    console.log("Token expires in:", responseData.expires_in, "seconds");
                    
                    // Store token using the new storage mechanism
                    tokenStorage.setToken(responseData.access_token, responseData.expires_in || 3600);
                    
                    return responseData.access_token;
                } else {
                    const error = new Error('Access token not found in successful response: ' + responseText);
                    console.error("Token refresh error:", error.message);
                    throw error;
                }
            } catch (parseError) {
                const error = new Error(`Failed to parse token refresh response: ${parseError}. Response: ${responseText}`);
                console.error("JSON parse error:", error.message);
                throw error;
            }
        } else {
            console.error(`HTTP error during token refresh (${response.status}): ${responseText}`);
            
            // Check if it's a retryable error (5xx server errors or 429 rate limiting)
            const isRetryableError = response.status >= 500 || response.status === 429;
            
            if (isRetryableError && retryCount < maxRetries) {
                console.log(`Retryable error (${response.status}). Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return refreshAccessToken(retryCount + 1);
            }
            
            const error = new Error(`Failed to refresh token (${response.status}): ${responseText}`);
            throw error;
        }
    } catch (error: any) {
        console.error('Error refreshing token (attempt ' + (retryCount + 1) + '):', error.message);

        // If we've exhausted retries, throw the final error
        if (retryCount >= maxRetries) {
            throw new Error(`Token refresh failed after ${maxRetries + 1} attempts: ${error.message}`);
        }

        // For network errors or other non-HTTP errors, retry once more
        if (!error.message.includes('status') && !error.message.includes('Failed to refresh token')) {
            console.log(`Network/connection error. Waiting ${retryDelay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return refreshAccessToken(retryCount + 1);
        }

        throw error;
    }
}

/**
 * Gets the current access token, refreshing if necessary
 * @returns {string} The current valid access token
 * @throws {Error} If token cannot be obtained
 */
async function getCurrentAccessToken(): Promise<string> {
    return await getValidAccessToken();
}

/**
 * Makes a request to the ChannelAdvisor API with automatic token refresh
 * @param {string} endpoint - The API endpoint to call
 * @param {string} method - HTTP method (get, post, patch, etc.)
 * @param {object} payload - Optional payload for POST/PATCH requests
 * @returns {object|null} The JSON response or null if the request fails
 */
async function makeApiRequest(endpoint: string, method = 'get', payload: any = null) {
    let currentToken = await getCurrentAccessToken();

    const options: RequestInit = {
        method: method.toLowerCase(),
        headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
        },
    };
    
    if (payload && method.toLowerCase() !== 'get') {
        options.body = JSON.stringify(payload);
    }

    try {
        let response = await fetch(BASE_URL + endpoint, options);
        console.log(`API ${method.toUpperCase()} Request to ${endpoint} - Initial Response Code: ${response.status}`);

        if (response.status === 401) {
            console.log("Received 401 Unauthorized. Clearing stored token and refreshing...");
            tokenStorage.clearToken(); // Clear potentially corrupted token
            currentToken = await refreshAccessToken();
            (options.headers as any).Authorization = `Bearer ${currentToken}`;
            response = await fetch(BASE_URL + endpoint, options);
            console.log(`API ${method.toUpperCase()} Request to ${endpoint} - Retry Response Code: ${response.status}`);
        }

        if (response.ok) {
            const text = await response.text();
            return text ? JSON.parse(text) : { success: true };
        } else {
            const errorText = await response.text();
            console.error(`API Error (${response.status}) for ${endpoint}: ${errorText}`);
            return null;
        }
    } catch (error: any) {
        console.error(`Network or runtime error making API request to ${endpoint}: ${error.message}`);
        return null;
    }
}


/**
 * Gets product ID by SKU
 * @param {string} sku - The SKU to look up
 * @returns {string|null} The product ID or null if not found
 */
async function getProductIdBySku(sku: string) {
    const endpoint = `/v1/Products?$filter=Sku eq '${sku}'`;
    const response = await makeApiRequest(endpoint);

    if (response && response.value && response.value.length > 0) {
        return response.value[0].ID;
    }
    return null;
}


/**
 * Fetches detailed product information by ID
 * @param {string} productId - The product ID to fetch details for
 * @returns {object|null} The product details or null if fetch fails
 */
async function fetchProductDetails(productId: string) {
    const endpoints = {
        basic: `/v1/Products(${productId})`,
        attributes: `/v1/Products(${productId})/Attributes`,
        labels: `/v1/Products(${productId})/Labels`,
        images: `/v1/Products(${productId})/Images`
    };

    const details: any = {};

    for (const [key, endpoint] of Object.entries(endpoints)) {
        const response = await makeApiRequest(endpoint);
        if (response) {
            details[key] = response.value ? response.value : response;
        } else {
            console.error(`Failed to fetch details for endpoint: ${endpoint}`);
            // Continue with other endpoints even if one fails
            details[key] = null;
        }
    }
    return details;
}

/**
 * Creates a fallback product structure for when ChannelAdvisor API fails
 * @param {string} sku - The SKU to create fallback data for
 * @returns {object} Basic product structure with the provided SKU
 */
function createFallbackProduct(sku: string) {
    console.log(`Creating fallback product data for SKU: ${sku}`);
    return {
        basic: {
            ID: null,
            Sku: sku,
            Title: `Product ${sku}`,
            Brand: null,
            Description: null,
            UPC: null,
            MPN: null,
            ASIN: null,
            Classification: null,
            IsParent: false,
            ParentProductID: null,
            RelationshipName: null,
            MinPrice: null,
            MaxPrice: null,
            Cost: null,
            RetailPrice: null,
            StartingPrice: null,
            ReservePrice: null,
            BuyItNowPrice: null,
            StorePrice: null,
            SecondChanceOfferPrice: null,
            DisplayInStore: false,
            IsBlocked: false,
            BlockComment: null,
            TotalAvailableQuantity: 0,
            OpenAllocatedQuantity: 0,
            PendingCheckoutQuantity: 0,
            PendingPaymentQuantity: 0,
            PendingShipmentQuantity: 0,
            TotalQuantitySold: 0,
            CreateDateUtc: new Date().toISOString(),
            UpdateDateUtc: new Date().toISOString(),
            QuantityUpdateDateUtc: new Date().toISOString(),
            LastSaleDateUtc: null,
        },
        attributes: null,
        labels: null,
        images: null,
        isFallback: true
    };
}

export async function fetchProductFromChannelAdvisor(sku: string) {
    try {
        console.log(`Attempting to fetch product data for SKU: ${sku}`);
        
        const productId = await getProductIdBySku(sku);
        if (!productId) {
            console.log(`Product with SKU '${sku}' not found in ChannelAdvisor. Using fallback.`);
            return createFallbackProduct(sku);
        }
        
        const productDetails = await fetchProductDetails(productId);
        if (!productDetails || !productDetails.basic) {
            console.log(`Failed to fetch complete product details for SKU '${sku}'. Using fallback.`);
            return createFallbackProduct(sku);
        }
        
        console.log(`Successfully fetched product data for SKU: ${sku}`);
        return productDetails;
        
    } catch (error) {
        console.error(`Error fetching product from ChannelAdvisor for SKU '${sku}':`, error);
        console.log(`Using fallback product data for SKU: ${sku}`);
        return createFallbackProduct(sku);
    }
}

/**
 * Updates the RetailPrice of a product in ChannelAdvisor
 * @param {string} productId - The product ID to update
 * @param {number} billAmount - The total bill amount to set as RetailPrice
 * @returns {boolean} True if update was successful, false otherwise
 */
export async function updateProductRetailPrice(productId: string, billAmount: number) {
    if (!productId || typeof billAmount !== 'number') {
        console.error(`Invalid parameters: productId=${productId}, billAmount=${billAmount}`);
        return false;
    }
    
    const endpoint = `/v1/Products(${productId})`;
    const payload = {
        Cost: billAmount
    };
    
    try {
        const response = await makeApiRequest(endpoint, 'patch', payload);
        
        if (response) {
            console.log(`Successfully updated RetailPrice to ${billAmount} for product ${productId}`);
            return true;
        } else {
            console.error(`Failed to update RetailPrice for product ${productId}`);
            return false;
        }
    } catch (error: any) {
        console.error(`Error updating RetailPrice: ${error.message}`);
        return false;
    }
}
