import React from 'react';
import ReactDOM from 'react-dom';
import { useTheme } from '../context/ThemeContext';
import { MODAL_CONSTANTS } from '../styles/modalStyles';

interface ModalPortalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

const ModalPortal: React.FC<ModalPortalProps> = ({
    isOpen,
    onClose,
    children
}) => {
    const { theme } = useTheme();

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <>
            {/* Backdrop with blur effect */}
            <div
                className={`fixed inset-0 bg-black ${MODAL_CONSTANTS.BACKDROP_OPACITY} ${MODAL_CONSTANTS.BACKDROP_BLUR} ${MODAL_CONSTANTS.Z_INDICES.BACKDROP} transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal content */}
            <div
                className={`fixed inset-0 flex items-center justify-center ${MODAL_CONSTANTS.Z_INDICES.CONTENT} px-4 transition-all ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                {children}
            </div>
        </>,
        document.body
    );
};

export default ModalPortal;
