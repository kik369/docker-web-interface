export default function Background() {
    return (
        <div
            className='fixed top-0 left-0 w-full h-full -z-10'
            style={{
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
            }}
        />
    );
}
