import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../AuthContext'
import { useCurrency } from '../CurrencyContext'
import * as api from '../api'
import type { Expense, TripBalances, TripMember } from '../types'
import { EXPENSE_CATEGORIES } from '../types'
import { PencilIcon, TrashIcon } from './icons'

interface GroupExpensesProps {
  tripId: number | null
}

const CATEGORY_ICONS: Record<string, string> = {
  food: '🍽️',
  transport: '🚕',
  lodging: '🏨',
  activities: '🎟️',
  shopping: '🛍️',
  other: '💳',
}

export default function GroupExpenses({ tripId }: GroupExpensesProps) {
  const { token } = useAuth()
  const { formatPrice } = useCurrency()
  // Expense splits need cent precision, unlike the rest of the app's whole-number prices.
  const formatUsd = (amount: number) => formatPrice(amount, 2)
  const [members, setMembers] = useState<TripMember[] | null>(null)
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [balances, setBalances] = useState<TripBalances | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newMemberName, setNewMemberName] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [paidByMemberId, setPaidByMemberId] = useState<number | null>(null)
  const [splitBetween, setSplitBetween] = useState<Set<number>>(new Set())
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function loadAll() {
    if (!token || !tripId) return
    try {
      const [m, e, b] = await Promise.all([
        api.listTripMembers(token, tripId),
        api.listExpenses(token, tripId),
        api.getTripBalances(token, tripId),
      ])
      setMembers(m)
      setExpenses(e)
      setBalances(b)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load group expenses.')
    }
  }

  useEffect(() => {
    loadAll()
    // loadAll is redefined each render but only depends on token/tripId, which are the real triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tripId])

  if (!tripId) {
    return (
      <div className="workspace-panel">
        <h2>Group expenses</h2>
        <p className="ge-empty-hint">Save this trip first to start tracking who paid for what.</p>
      </div>
    )
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault()
    const name = newMemberName.trim()
    if (!name || !token || !tripId) return
    setAddingMember(true)
    try {
      await api.addTripMember(token, tripId, name)
      setNewMemberName('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member.')
    } finally {
      setAddingMember(false)
    }
  }

  async function handleDeleteMember(member: TripMember) {
    if (!token || !tripId) return
    if (!window.confirm(`Remove ${member.name} from this trip's ledger?`)) return
    try {
      await api.deleteTripMember(token, tripId, member.id)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member.')
    }
  }

  function openExpenseForm() {
    if (!members || members.length === 0) return
    setEditingExpenseId(null)
    setDescription('')
    setAmount('')
    setCategory('other')
    setPaidByMemberId(members[0].id)
    setSplitBetween(new Set(members.map((m) => m.id)))
    setSplitType('equal')
    setCustomAmounts({})
    setFormError(null)
    setShowExpenseForm(true)
  }

  function openEditForm(expense: Expense) {
    setEditingExpenseId(expense.id)
    setDescription(expense.description)
    setAmount(String(expense.amount))
    setCategory(expense.category)
    setPaidByMemberId(expense.paidByMemberId)
    setSplitBetween(new Set(expense.splits.map((s) => s.memberId)))
    // Pre-fill with the exact existing shares (as "custom") rather than guessing
    // whether they were originally an equal split — re-deriving an equal split here
    // could silently change amounts the traveler already agreed on.
    setSplitType('custom')
    setCustomAmounts(
      Object.fromEntries(expense.splits.map((s) => [s.memberId, String(s.shareAmount)])),
    )
    setFormError(null)
    setShowExpenseForm(true)
  }

  function toggleSplitMember(id: number) {
    setSplitBetween((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const parsedAmount = Number(amount) || 0
  const customTotal = Array.from(splitBetween).reduce((sum, id) => sum + (Number(customAmounts[id]) || 0), 0)

  async function handleSubmitExpense(e: FormEvent) {
    e.preventDefault()
    if (!token || !tripId) return
    setFormError(null)

    const desc = description.trim()
    if (!desc) {
      setFormError('Enter a description.')
      return
    }
    if (!parsedAmount || parsedAmount <= 0) {
      setFormError('Enter an amount greater than zero.')
      return
    }
    if (paidByMemberId === null) {
      setFormError('Choose who paid.')
      return
    }
    if (splitBetween.size === 0) {
      setFormError('Select at least one person to split with.')
      return
    }

    let customSplits: Record<number, number> | undefined
    if (splitType === 'custom') {
      if (Math.abs(customTotal - parsedAmount) > 0.01) {
        setFormError(`Custom amounts add up to ${formatUsd(customTotal)}, not ${formatUsd(parsedAmount)}.`)
        return
      }
      customSplits = {}
      for (const id of splitBetween) {
        customSplits[id] = Number(customAmounts[id]) || 0
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        description: desc,
        amount: parsedAmount,
        category,
        paidByMemberId,
        splitBetweenMemberIds: Array.from(splitBetween),
        splitType,
        customSplits,
      }
      if (editingExpenseId !== null) {
        await api.updateExpense(token, tripId, editingExpenseId, payload)
      } else {
        await api.addExpense(token, tripId, payload)
      }
      setShowExpenseForm(false)
      setEditingExpenseId(null)
      await loadAll()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save expense.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteExpense(expense: Expense) {
    if (!token || !tripId) return
    if (!window.confirm(`Delete "${expense.description}"?`)) return
    try {
      await api.deleteExpense(token, tripId, expense.id)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete expense.')
    }
  }

  return (
    <div className="workspace-panel">
      <h2>Group expenses</h2>
      {error && <p className="error-banner">{error}</p>}

      <section className="ge-section">
        <h3>Who's on this trip?</h3>
        <div className="ge-members-row">
          {members?.map((m) => (
            <span className="ge-member-chip" key={m.id}>
              {m.name}
              <button type="button" aria-label={`Remove ${m.name}`} onClick={() => handleDeleteMember(m)}>
                <TrashIcon size={13} />
              </button>
            </span>
          ))}
          {members && members.length === 0 && (
            <p className="ge-empty-hint">Add the people splitting costs on this trip.</p>
          )}
        </div>
        <form className="ge-add-member-form" onSubmit={handleAddMember}>
          <input
            type="text"
            placeholder="Add a person's name…"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            disabled={addingMember}
          />
          <button type="submit" disabled={addingMember || !newMemberName.trim()}>
            Add
          </button>
        </form>
      </section>

      {members && members.length > 0 && (
        <section className="ge-section">
          <div className="ge-section-head">
            <h3>Expenses</h3>
            {!showExpenseForm && (
              <button type="button" className="ge-add-expense-btn" onClick={openExpenseForm}>
                + Add expense
              </button>
            )}
          </div>

          {showExpenseForm && (
            <form className="ge-expense-form" onSubmit={handleSubmitExpense}>
              {formError && <p className="ge-form-error">{formError}</p>}
              <div className="ge-form-row">
                <input
                  type="text"
                  placeholder="What was it for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="ge-amount-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="ge-form-row">
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_ICONS[c]} {c[0].toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
                <select value={paidByMemberId ?? ''} onChange={(e) => setPaidByMemberId(Number(e.target.value))}>
                  <option value="" disabled>
                    Paid by…
                  </option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ge-split-head">
                <span>Split between</span>
                <div className="ge-split-toggle">
                  <button
                    type="button"
                    className={splitType === 'equal' ? 'active' : ''}
                    onClick={() => setSplitType('equal')}
                  >
                    Equally
                  </button>
                  <button
                    type="button"
                    className={splitType === 'custom' ? 'active' : ''}
                    onClick={() => setSplitType('custom')}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <div className="ge-split-list">
                {members.map((m) => {
                  const checked = splitBetween.has(m.id)
                  const equalShare = splitBetween.size > 0 ? parsedAmount / splitBetween.size : 0
                  return (
                    <label className="ge-split-row" key={m.id}>
                      <span className="ge-split-row-name">
                        <input type="checkbox" checked={checked} onChange={() => toggleSplitMember(m.id)} />
                        {m.name}
                      </span>
                      {checked && splitType === 'equal' && (
                        <span className="ge-split-row-amount">{formatUsd(equalShare)}</span>
                      )}
                      {checked && splitType === 'custom' && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="ge-split-row-input"
                          value={customAmounts[m.id] ?? ''}
                          onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        />
                      )}
                    </label>
                  )
                })}
              </div>

              {splitType === 'custom' && (
                <p className={`ge-split-total ${Math.abs(customTotal - parsedAmount) > 0.01 ? 'mismatch' : ''}`}>
                  Total: {formatUsd(customTotal)} / {formatUsd(parsedAmount || 0)}
                </p>
              )}

              <div className="ge-form-actions">
                <button
                  type="button"
                  className="ge-cancel-btn"
                  onClick={() => {
                    setShowExpenseForm(false)
                    setEditingExpenseId(null)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : editingExpenseId !== null ? 'Save changes' : 'Add expense'}
                </button>
              </div>
            </form>
          )}

          <div className="ge-expense-list">
            {expenses?.map((exp) => (
              <div className="ge-expense-row" key={exp.id}>
                <span className="ge-expense-icon">{CATEGORY_ICONS[exp.category] ?? '💳'}</span>
                <div className="ge-expense-body">
                  <div className="ge-expense-top">
                    <h4>{exp.description}</h4>
                    <span>{formatUsd(exp.amount)}</span>
                  </div>
                  <p>
                    {exp.paidByName} paid · split between {exp.splits.map((s) => s.memberName).join(', ')}
                  </p>
                </div>
                <div className="ge-expense-actions">
                  <button type="button" aria-label={`Edit ${exp.description}`} onClick={() => openEditForm(exp)}>
                    <PencilIcon size={15} />
                  </button>
                  <button type="button" aria-label={`Delete ${exp.description}`} onClick={() => handleDeleteExpense(exp)}>
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
            ))}
            {expenses && expenses.length === 0 && !showExpenseForm && (
              <p className="ge-empty-hint">No expenses logged yet.</p>
            )}
          </div>
        </section>
      )}

      {balances && balances.balances.length > 0 && (
        <section className="ge-section">
          <h3>Balances</h3>
          <div className="ge-balances-list">
            {balances.balances.map((b) => (
              <div className="ge-balance-row" key={b.memberId}>
                <span>{b.memberName}</span>
                <span className={b.netBalance > 0.01 ? 'positive' : b.netBalance < -0.01 ? 'negative' : ''}>
                  {b.netBalance > 0.01 && `is owed ${formatUsd(b.netBalance)}`}
                  {b.netBalance < -0.01 && `owes ${formatUsd(-b.netBalance)}`}
                  {Math.abs(b.netBalance) <= 0.01 && 'settled up'}
                </span>
              </div>
            ))}
          </div>

          {balances.settlements.length > 0 && (
            <div className="ge-settlements">
              <h4>Settle up</h4>
              {balances.settlements.map((s, i) => (
                <p key={i} className="ge-settlement-row">
                  <strong>{s.fromMemberName}</strong> pays <strong>{s.toMemberName}</strong> {formatUsd(s.amount)}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
