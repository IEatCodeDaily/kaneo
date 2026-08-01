import { createContext, type ReactNode, useContext } from "react";

export type BoardDensity = "comfortable" | "compact";

const BoardDensityContext = createContext<BoardDensity>("comfortable");

export function BoardDensityProvider({
  density,
  children,
}: {
  density: BoardDensity;
  children: ReactNode;
}) {
  return (
    <BoardDensityContext.Provider value={density}>
      {children}
    </BoardDensityContext.Provider>
  );
}

export function useBoardDensity(): BoardDensity {
  return useContext(BoardDensityContext);
}
