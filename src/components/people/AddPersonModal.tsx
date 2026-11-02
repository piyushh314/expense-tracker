import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, AtSign, AlertTriangle } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db';
import { useToast } from '../../contexts/ToastContext';
import { getPersonAvatarColor } from '../../utils/peopleLedger';
import type { Person, PersonLabel } from '../../types';

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  personToEdit?: Person | null;
  onPersonSaved?: (person: Person) => void;
}

const LABELS: PersonLabel[] = ['Roommate', 'Friend', 'Family', 'Other'];

const PALETTE = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#F97316', // Orange
  '#EAB308', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#14B8A6', // Teal
];

export default function AddPersonModal({
  isOpen,
  onClose,
  personToEdit,
  onPersonSaved,
}: AddPersonModalProps) {
  const { showToast } = useToast();

  const [name, setName] = useState(personToEdit?.name || '');
  const [nickname, setNickname] = useState(personToEdit?.nickname || '');
  const [phone, setPhone] = useState(personToEdit?.phone || '');
  const [upiId, setUpiId] = useState(personToEdit?.upiId || '');
  const [label, setLabel] = useState<PersonLabel>(personToEdit?.label || 'Friend');
  const [color, setColor] = useState(personToEdit?.color || PALETTE[0]);
  const [existingPeople, setExistingPeople] = useState<Person[]>([]);

  // Fetch people to check for duplicates
  useMemo(async () => {
    if (isOpen) {
      const all = await db.persons.toArray();
      setExistingPeople(all);
      if (personToEdit) {
        setName(personToEdit.name);
        setNickname(personToEdit.nickname || '');
        setPhone(personToEdit.phone || '');
        setUpiId(personToEdit.upiId || '');
        setLabel(personToEdit.label);
        setColor(personToEdit.color);
      } else {
        setName('');
        setNickname('');
        setPhone('');
        setUpiId('');
        setLabel('Friend');
        setColor(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      }
    }
  }, [isOpen, personToEdit]);

  // Check duplicate name
  const isDuplicate = useMemo(() => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return false;
    return existingPeople.some(
      p => p.id !== personToEdit?.id && p.name.trim().toLowerCase() === trimmed
    );
  }, [name, existingPeople, personToEdit]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const personData: Person = {
      id: personToEdit?.id || uuid(),
      name: trimmedName,
      nickname: nickname.trim() || undefined,
      phone: phone.trim() || undefined,
      upiId: upiId.trim() || undefined,
      label,
      color: color || getPersonAvatarColor(trimmedName),
      archived: personToEdit?.archived || false,
      createdAt: personToEdit?.createdAt || Date.now(),
    };

    if (personToEdit) {
      await db.persons.put(personData);
      showToast(`Updated ${personData.name}`);
    } else {
      await db.persons.add(personData);
      showToast(`Added ${personData.name}`);
    }

    onPersonSaved?.(personData);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
          >
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {personToEdit ? 'Edit Person' : 'Add Person'}
              </h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 pt-4">
              {/* Full Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Rohit Sharma"
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-gray-900 dark:text-white"
                  />
                </div>
                {isDuplicate && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
                    <AlertTriangle size={13} /> A person with this exact name already exists.
                  </p>
                )}
              </div>

              {/* Nickname / Display Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Nickname / Call Sign <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="e.g. Rohit"
                  className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-gray-900 dark:text-white"
                />
              </div>

              {/* Label Chips */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                  Relationship / Group
                </label>
                <div className="flex gap-2 flex-wrap">
                  {LABELS.map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLabel(l)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        label === l
                          ? 'bg-indigo-500 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone & UPI ID in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Phone <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                    UPI ID <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <AtSign size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                      placeholder="user@upi"
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Avatar Color Picker */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                  Avatar Color
                </label>
                <div className="flex gap-2 flex-wrap items-center">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c ? 'scale-125 ring-2 ring-offset-2 ring-indigo-500' : 'hover:scale-110'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!name.trim()}
                  className="flex-1 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
                >
                  {personToEdit ? 'Save Changes' : 'Add Person'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

