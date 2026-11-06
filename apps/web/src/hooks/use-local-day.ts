import { useEffect, useState } from "react";

export function useLocalDay() {
  const [day, setDay] = useState(() => new Date().toDateString());
  useEffect(() => {
    const update = () => setDay(new Date().toDateString());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return day;
}
