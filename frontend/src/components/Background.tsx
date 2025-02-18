export default function Background() {
    return (
        <div
            className='fixed top-0 left-0 w-full h-full -z-10'
            style={{
                backgroundColor: '#050505',
                backgroundImage: `
                    radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px),
                    linear-gradient(to bottom,
                        #050505,
                        transparent 40%,
                        transparent 60%,
                        #050505
                    )
                `,
                backgroundSize: '50px 50px, 100% 100%',
                backgroundPosition: '0 0, 0 0',
            }}
        />
    );
}
