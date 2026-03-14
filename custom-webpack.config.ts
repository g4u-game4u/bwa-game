import {EnvironmentPlugin, DefinePlugin} from 'webpack';
import {config} from 'dotenv';

config()

module.exports = {
    resolve: {
        fallback: {
            "process": false
        }
    },
    plugins: [
        new EnvironmentPlugin({
            // Uppercase (standard convention)
            BACKEND_URL_BASE: "",
            CLIENT_ID: "",
            FUNIFIER_BASIC_TOKEN: "",
            FUNIFIER_BASE_URL: "",
            FUNIFIER_API_KEY: "",
            MAINTENANCE_MODE: "false",
            // Lowercase (Vercel compatibility)
            backend_url_base: "",
            client_id: "",
            funifier_basic_token: "",
            funifier_base_url: "",
            funifier_api_key: "",
            maintenanceMode: "false"
        }),
        // Ensure process.env is available in browser
        new DefinePlugin({
            'process.env': JSON.stringify(process.env)
        })
    ]
}
