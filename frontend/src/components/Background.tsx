import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function Background() {
    const { theme } = useTheme();

    const darkBackground = {
        backgroundColor: '#050505',
        backgroundImage: `
                    linear-gradient(
                        to bottom,
                        rgba(5, 5, 5, 1),
                        rgba(5, 5, 5, 0) 40%,
                        rgba(5, 5, 5, 0) 60%,
                        rgba(5, 5, 5, 1)
                    ),
                    radial-gradient(circle at center, #ffffff50 1px, transparent 1px)
                `,
        backgroundSize: '100% 100%, 50px 50px',
    };

    const lightBackground = {
        backgroundColor: '#f8fafc',
        backgroundImage: `
            linear-gradient(
                to bottom,
                rgba(248, 250, 252, 1),
                rgba(248, 250, 252, 0) 40%,
                rgba(248, 250, 252, 0) 60%,
                rgba(248, 250, 252, 1)
            ),
            radial-gradient(circle at center, #00000020 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 50px 50px',
    };

    return (
        <div
            className='fixed top-0 left-0 w-full h-full -z-10 transition-all duration-300'
            style={theme === 'dark' ? darkBackground : lightBackground}
        />
    );
}
