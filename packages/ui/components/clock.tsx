'use client';
import { useEffect, useState } from 'react';

import { SlidingNumber } from './sliding-number';

export function Clock() {
    const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const readNow = () => {
            const now = new Date();
            setTime({
                hours: now.getHours(),
                minutes: now.getMinutes(),
                seconds: now.getSeconds()
            });
        };

        const interval = setInterval(() => {
            readNow();
        }, 1000);
        readNow();
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-0.5 font-mono">
            <SlidingNumber value={time.hours} padStart={true} />
            <span className="text-zinc-500">:</span>
            <SlidingNumber value={time.minutes} padStart={true} />
            <span className="text-zinc-500">:</span>
            <SlidingNumber value={time.seconds} padStart={true} />
        </div>
    );
}
