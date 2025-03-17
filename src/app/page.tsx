"use client"; // Enables React hooks in Next.js
import { useState, useEffect } from "react";
import { PulseLoader } from "react-spinners"; // Import a spinner from react-spinners

type Transaction = {
  _id: string;
  type: string;
  amount: number;
  description: string;
  date: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [formData, setFormData] = useState({
    type: "income",
    amount: "",
    description: "",
  });
  const [balance, setBalance] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ income: number | null, expense: number | null }>({
    income: null, 
    expense: null 
  });
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  // Fetch all transactions
  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const response = await fetch(`${API_URL}/api/transactions`);
      const data: Transaction[] = await response.json();
      setTransactions(data);
      setFilteredTransactions(data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Fetch balance
  const fetchBalance = async () => {
    setLoadingBalance(true);
    try {
      const response = await fetch(`${API_URL}/api/balance`);
      const data = await response.json();
      setBalance(data.balance);
    } catch (error) {
      console.error("Error fetching balance:", error);
    } finally {
      setLoadingBalance(false);
    }
  };

  // Fetch summary
  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const response = await fetch(`${API_URL}/api/summary`);
      const data = await response.json();
      setSummary(data);
    } catch (error) {
      console.error("Error fetching summary:", error);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Add a new transaction
  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const transactionData = {
        ...formData,
        date: new Date().toISOString(),
      };

      const response = await fetch(`${API_URL}/api/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transactionData),
      });
      if (response.ok) {
        setFormData({ type: "income", amount: "", description: "" });
        fetchTransactions();
        fetchBalance();
        fetchSummary();
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
    } finally {
      setLoading(false);
    }
  };

  // Delete a transaction
  const deleteTransaction = async (id: string) => {
    setLoading(true);
    try {
      await fetch(`${API_URL}/api/transactions/${id}`, { method: "DELETE" });
      fetchTransactions();
      fetchBalance();
      fetchSummary();
    } catch (error) {
      console.error("Error deleting transaction:", error);
    } finally {
      setLoading(false);
    }
  };

  // Export transactions as CSV
  const exportCSV = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/transactions/export`);
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "transactions.csv";
      link.click();
    } catch (error) {
      console.error("Error exporting CSV:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter transactions by date and type
  const filterTransactions = () => {
    let filtered = [...transactions];

    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }

    if (filterDate) {
      const selectedDate = new Date(filterDate);
      filtered = filtered.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.toDateString() === selectedDate.toDateString();
      });
    }

    setFilteredTransactions(filtered);
  };

  useEffect(() => {
    filterTransactions();
  }, [filterDate, filterType, transactions]);

  useEffect(() => {
    fetchTransactions();
    fetchBalance();
    fetchSummary();
  }, []);

  const isInitialLoading = loadingBalance && loadingSummary && loadingTransactions;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Transaction Manager</h1>

      {loading && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center">
            <PulseLoader color="#3B82F6" size={15} />
            <p className="mt-3 text-gray-700">Processing...</p>
          </div>
        </div>
      )}

      {isInitialLoading ? (
        <div className="flex justify-center items-center my-12">
          <PulseLoader color="#3B82F6" size={15} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-gray-50 p-4 rounded-lg shadow-sm">
            <div className="text-center p-3 bg-white rounded shadow">
              <p className="text-gray-500">Current Balance</p>
              {loadingBalance ? (
                <div className="flex justify-center py-1">
                  <PulseLoader color="#3B82F6" size={10} />
                </div>
              ) : (
                <p className="text-2xl font-bold">
                  ${balance !== null ? balance : 0}
                </p>
              )}
            </div>
            <div className="text-center p-3 bg-white rounded shadow">
              <p className="text-gray-500">Total Income</p>
              {loadingSummary ? (
                <div className="flex justify-center py-1">
                  <PulseLoader color="#10B981" size={10} />
                </div>
              ) : (
                <p className="text-2xl font-bold text-green-600">
                  ${summary.income !== null ? summary.income : 0}
                </p>
              )}
            </div>
            <div className="text-center p-3 bg-white rounded shadow">
              <p className="text-gray-500">Total Expense</p>
              {loadingSummary ? (
                <div className="flex justify-center py-1">
                  <PulseLoader color="#EF4444" size={10} />
                </div>
              ) : (
                <p className="text-2xl font-bold text-red-600">
                  ${summary.expense !== null ? summary.expense : 0}
                </p>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4">Add New Transaction</h2>
            <form onSubmit={addTransaction} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="border p-2 rounded w-full"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <input
                  type="number"
                  placeholder="Amount"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  className="border p-2 rounded w-full"
                  required
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="border p-2 rounded w-full"
                  required
                />
              </div>
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full sm:w-auto"
                disabled={loading}
              >
                Add Transaction
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4">Filter Transactions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 mb-1">Filter by Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="border p-2 rounded w-full"
                >
                  <option value="all">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Filter by Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="border p-2 rounded w-full"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Transaction History</h2>
              <button
                onClick={exportCSV}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2"
                disabled={loading}
              >
                <span>Export CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              {loadingTransactions ? (
                <div className="flex justify-center py-12">
                  <PulseLoader color="#3B82F6" size={15} />
                </div>
              ) : (
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-gray-100 text-gray-700 uppercase">
                    <tr>
                      <th className="px-6 py-3 border border-gray-200">Type</th>
                      <th className="px-6 py-3 border border-gray-200">Amount</th>
                      <th className="px-6 py-3 border border-gray-200">Description</th>
                      <th className="px-6 py-3 border border-gray-200">Date</th>
                      <th className="px-6 py-3 border border-gray-200">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((transaction) => (
                        <tr key={transaction._id} className="border-b hover:bg-gray-50">
                          <td className={`px-6 py-4 border border-gray-200 ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                          </td>
                          <td className="px-6 py-4 border border-gray-200">${transaction.amount}</td>
                          <td className="px-6 py-4 border border-gray-200">{transaction.description}</td>
                          <td className="px-6 py-4 border border-gray-200">
                            {new Date(transaction.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 border border-gray-200">
                            <button
                              onClick={() => deleteTransaction(transaction._id)}
                              className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded"
                              disabled={loading}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center border border-gray-200">
                          No transactions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}