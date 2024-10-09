const db = require('./db');

function webhookHandler(req, res) {
  const { requestId } = req.body;

  // Ensure requestId is provided
  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  db.query(
    'UPDATE requests SET status = $1 WHERE request_id = $2',
    ['completed', requestId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // Optionally check if any rows were affected
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      res.json({ success: true });
    },
  );
}

module.exports = { webhookHandler };
