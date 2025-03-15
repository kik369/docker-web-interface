/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['Fira Code', 'monospace'],
            },
            colors: {
                // Light mode colors
                'light-primary': '#3490dc',
                'light-secondary': '#ffed4a',
                'light-background': '#f8fafc',
                'light-surface': '#ffffff',
                'light-text': '#1a202c',

                // Dark mode colors
                'dark-primary': '#90cdf4',
                'dark-secondary': '#faf089',
                'dark-background': '#1a202c',
                'dark-surface': '#2d3748',
                'dark-text': '#f7fafc',
            },
        },
    },
    plugins: [],
};
