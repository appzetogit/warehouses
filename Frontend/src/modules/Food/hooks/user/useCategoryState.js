import { useState, useCallback } from 'react';

export const useCategoryState = (initialCategory) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'all');
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [favorites, setFavorites] = useState(new Set());
  const [sortBy, setSortBy] = useState(null);
  const [selectedCuisine, setSelectedCuisine] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState('sort');
  const [activeScrollSection, setActiveScrollSection] = useState('sort');
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false);

  const toggleFilter = useCallback((filterId) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filterId)) next.delete(filterId);
      else next.add(filterId);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((sellerId) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(sellerId)) next.delete(sellerId);
      else next.add(sellerId);
      return next;
    });
  }, []);

  return {
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    activeFilters, setActiveFilters, toggleFilter,
    favorites, setFavorites, toggleFavorite,
    sortBy, setSortBy,
    selectedCuisine, setSelectedCuisine,
    isFilterOpen, setIsFilterOpen,
    activeFilterTab, setActiveFilterTab,
    activeScrollSection, setActiveScrollSection,
    isLoadingFilterResults, setIsLoadingFilterResults
  };
};
