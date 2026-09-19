import { emptyOrders } from "@store/utils/adminFallbackData"
import OrdersTopbar from "@store/components/admin/orders/OrdersTopbar"
import OrdersTable from "@store/components/admin/orders/OrdersTable"
import FilterPanel from "@store/components/admin/orders/FilterPanel"
import ViewOrderDialog from "@store/components/admin/orders/ViewOrderDialog"
import SettingsDialog from "@store/components/admin/orders/SettingsDialog"
import { useOrdersManagement } from "@store/components/admin/orders/useOrdersManagement"

const offlinePaymentsOrders = emptyOrders.filter((order) => order.orderStatus === "Offline Payments")

export default function OfflinePayments() {
  const {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredOrders,
    count,
    activeFiltersCount,
    sellers,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  } = useOrdersManagement(offlinePaymentsOrders, "offline-payments", "Offline Payments")

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <div className="mb-4">
        <p className="rounded-md bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
          For Offline Payments Please Verify If The Payments Are Safely Received To Your Account.
          Customer Is Not Liable If You Confirm And Deliver The Orders Without Checking Payment
          Transactions.
        </p>
      </div>
      <OrdersTopbar 
        title="Offline Payments" 
        count={count} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        sellers={sellers}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
      />
      <ViewOrderDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
      />
      <OrdersTable 
        orders={filteredOrders} 
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
      />
    </div>
  )
}
