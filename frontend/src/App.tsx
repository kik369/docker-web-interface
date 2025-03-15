import React from 'react';
import { ContainerProvider } from './context/ContainerContext';
import { ThemeProvider } from './context/ThemeContext';
import MainApp from './components/MainApp';

function App() {
    return (
        <ThemeProvider>
            <ContainerProvider>
                <MainApp />
            </ContainerProvider>
        </ThemeProvider>
    );
}

export default App;
