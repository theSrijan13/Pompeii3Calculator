/**
 * Configuration file for ChannelAdvisor integration
 * Contains all API keys, credentials, and endpoint URLs
 */

// ChannelAdvisor API Credentials
export const DEVELOPER_KEY = process.env.DEVELOPER_KEY;
export const BASE_URL = 'https://api.channeladvisor.com';

// OAuth Configuration
export const APPLICATION_ID = process.env.APPLICATION_ID;
export const SHARED_SECRET = process.env.SHARED_SECRET;
export const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
export const TOKEN_ENDPOINT = 'https://api.channeladvisor.com/oauth2/token';

// Gemini API Configuration
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Treat Metal Weight
export const CONVERSION_FACTOR = 0.2; // Metal Weight = Right Weight || Weight - (ExactCaratTotalWeight * 0.2)

// Google Sheets Configuration
export const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
export const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL; // Optional full URL; ID will be derived if provided
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
export const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL; // Service account email
export const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY; // Private key (PEM), may contain \n

// Sheet names expected in the shared spreadsheet
// Diamonds
export const SHEET_NATURAL_DIAMOND_DATA = 'NATURAL_DIAMOND_DATA';
export const SHEET_LAB_DIAMOND_DATA = 'LAB_DIAMOND_DATA';

// Metal and Labor
export const SHEET_METAL_COST = 'METAL_COST'; // columns: Metal purity, Metal Rate per gram
export const SHEET_LABOR_COST = 'LABOR_COST'; // columns: Setting cost per Stone, Fixed Labor Cost

// Gemstones (individual sheets consolidated at runtime)
export const SHEET_SAPPHIRE_GEMSTONE_DATA = 'SAPPHIRE_GEMSTONE_DATA';
export const SHEET_TOURMALINE_GEMSTONE_DATA = 'TOURMALINE_GEMSTONE_DATA';
export const SHEET_PERIDOT_GEMSTONE_DATA = 'PERIDOT_GEMSTONE_DATA';
export const SHEET_RUBY_GEMSTONE_DATA = 'RUBY_GEMSTONE_DATA';
export const SHEET_TOPAZ_GEMSTONE_DATA = 'TOPAZ_GEMSTONE_DATA';
export const SHEET_AMETHYST_GEMSTONE_DATA = 'AMETHYST_GEMSTONE_DATA';
export const SHEET_CITRINE_GEMSTONE_DATA = 'CITRINE_GEMSTONE_DATA';

// Supplier datasets
export const SHEET_LEES_SUPPLIER_DATA = 'LEES_SUPPLIER_DATA';
export const SHEET_FREMADA_SUPPLIER_DATA = 'FREMADA_SUPPLIER_DATA';
