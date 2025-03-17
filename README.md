# Transaction Management Frontend (Next.js)

This is the frontend for the **Transaction Management System**, built with **Next.js**. It provides a user-friendly interface for managing financial transactions, including creating, viewing, and exporting transactions.

---

## Objective

The objective of this frontend is to provide a seamless and responsive user interface for interacting with the Transaction Management System. It allows users to:

- View a list of transactions.
- Add new transactions (income or expense).
- Filter transactions by date and type.
- View the total balance and summary of income/expenses.
- Export transactions to a CSV file.

---

## How to Launch the Frontend

### Prerequisites

Before running the frontend, ensure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** or **yarn**

### Installation

1. Clone the repository:
2. Install dependencies: npm install
3. Set up environment variables:

Create a .env.local file in the frontend directory.

Add the following variables:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```
4. Start the development server:
```
npm run dev
```
