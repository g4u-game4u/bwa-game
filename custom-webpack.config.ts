import {EnvironmentPlugin} from 'webpack';
import {config} from 'dotenv';

config()

module.exports = {
    plugins: [
        new EnvironmentPlugin({
            // Uppercase (standard convention)
            BACKEND_URL_BASE: "",
            CLIENT_ID: "",
            FUNIFIER_BASIC_TOKEN: "",
            FUNIFIER_BASE_URL: "",
            FUNIFIER_API_KEY: "",
            // Lowercase (Vercel compatibility)
            backend_url_base: "",
            client_id: "",
            funifier_basic_token: "",
            funifier_base_url: "",
            funifier_api_key: ""
        })
    ]
}
