import { createContext, useContext, useState, type ReactNode } from 'react';
import { RESEARCH_NOTES } from '../data/seeds';

interface ResearchSelection {
  selectedNoteId: string;
  setSelectedNoteId: (id: string) => void;
}

const ResearchContext = createContext<ResearchSelection | null>(null);

export function ResearchProvider({ children }: { children: ReactNode }) {
  const [selectedNoteId, setSelectedNoteId] = useState<string>(
    RESEARCH_NOTES[0]?.id ?? '',
  );

  return (
    <ResearchContext.Provider value={{ selectedNoteId, setSelectedNoteId }}>
      {children}
    </ResearchContext.Provider>
  );
}

export function useResearchSelection(): ResearchSelection {
  const ctx = useContext(ResearchContext);
  if (ctx === null) {
    throw new Error('useResearchSelection must be used within a ResearchProvider');
  }
  return ctx;
}
