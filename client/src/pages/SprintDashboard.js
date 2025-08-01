import React, { useEffect, useState } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';

function SprintDashboard() {
  const { currentTeam } = useTeam();
  const [sprints, setSprints] = useState([]);
  const [editingSprint, setEditingSprint] = useState(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', goals: [''] });
  const [loading, setLoading] = useState(false);

  // Fetch sprints for current team
  useEffect(() => {
    if (currentTeam) {
      fetchSprints();
    }
  }, [currentTeam]);

  const fetchSprints = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/sprints?team_id=${currentTeam.id}`);
      setSprints(res.data.sprints || []);
    } catch (err) {
      setSprints([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (sprint) => {
    setEditingSprint(sprint.id);
    setForm({
      name: sprint.name,
      startDate: sprint.start_date,
      endDate: sprint.end_date,
      goals: sprint.goals || ['']
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this sprint?')) return;
    await api.delete(`/sprints/${id}`);
    fetchSprints();
  };

  const handleAssign = async (id) => {
    await api.post(`/sprints/${id}/assign`, { team_id: currentTeam.id });
    fetchSprints();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingSprint) {
        await api.put(`/sprints/${editingSprint}`, {
          ...form,
          team_id: currentTeam.id,
          goals: form.goals.filter(g => g.trim())
        });
      } else {
        await api.post('/sprints', {
          ...form,
          team_id: currentTeam.id,
          goals: form.goals.filter(g => g.trim())
        });
      }
      setEditingSprint(null);
      setForm({ name: '', startDate: '', endDate: '', goals: [''] });
      fetchSprints();
    } catch (err) {
      alert('Failed to save sprint');
    } finally {
      setLoading(false);
    }
  };

  const addGoal = () => setForm({ ...form, goals: [...form.goals, ''] });
  const removeGoal = (i) => setForm({ ...form, goals: form.goals.filter((_, idx) => idx !== i) });
  const updateGoal = (i, val) => setForm({ ...form, goals: form.goals.map((g, idx) => idx === i ? val : g) });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Sprint Dashboard</h1>
      <form onSubmit={handleSave} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Sprint Name</label>
          <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border rounded" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Start Date</label>
            <input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
              className="w-full px-3 py-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">End Date</label>
            <input type="date" required value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
              className="w-full px-3 py-2 border rounded" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Sprint Goals</label>
          {form.goals.map((goal, i) => (
            <div key={i} className="flex items-center space-x-2 mb-2">
              <input type="text" value={goal} onChange={e => updateGoal(i, e.target.value)}
                className="flex-1 px-3 py-2 border rounded" placeholder={`Goal ${i + 1}`} />
              {form.goals.length > 1 && (
                <button type="button" onClick={() => removeGoal(i)} className="text-red-600 px-2">Remove</button>
              )}
            </div>
          ))}
          {form.goals.length < 5 && (
            <button type="button" onClick={addGoal} className="mt-2 px-3 py-1 text-blue-600 border rounded">+ Add Goal</button>
          )}
        </div>
        <button type="submit" disabled={loading} className="w-full py-2 rounded bg-blue-600 text-white font-semibold">
          {editingSprint ? 'Update Sprint' : 'Create Sprint'}
        </button>
      </form>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">All Sprints</h2>
        {sprints.length === 0 ? (
          <p className="text-gray-500">No sprints found.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Name</th>
                <th>Dates</th>
                <th>Goals</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sprints.map(sprint => (
                <tr key={sprint.id} className="border-t">
                  <td>{sprint.name}</td>
                  <td>{sprint.start_date} - {sprint.end_date}</td>
                  <td>
                    <ul className="list-disc pl-4">
                      {(sprint.goals || []).map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </td>
                  <td>
                    <button onClick={() => handleEdit(sprint)} className="text-blue-600 px-2">Edit</button>
                    <button onClick={() => handleDelete(sprint.id)} className="text-red-600 px-2">Delete</button>
                    <button onClick={() => handleAssign(sprint.id)} className="text-green-600 px-2">Assign</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default SprintDashboard;