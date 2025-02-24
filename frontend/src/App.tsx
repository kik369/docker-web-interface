import React from 'react';
import { ContainerProvider } from './context/ContainerContext';
import MainApp from './components/MainApp';

function App() {
    return (
        <ContainerProvider>
            <MainApp />
        </ContainerProvider>
    );
}

export default App;
