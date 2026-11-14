import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/AdminLayout';
import Mascot from '../components/Mascot';
import ReviewForm, { Stars } from '../components/ReviewForm';
import { Alert, Loading, useToast } from '../components/ui';
import { fmtDt } from '../utils';

export default function Feedback() {
  const { setReviewNeeded } = useOutletContext();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api('review.mine').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  const r = data.review;

  const save = async (v) => {
    const res = await api('review.save', v);
    setData({ review: res.review, needed: false });
    setReviewNeeded(false);
    setEditing(false);
    toast('Thank you for your feedback! 💜');
  };

  return (
    <>
      <PageHeader title="Review & Suggestions" />
      <section className="card hero">
        <Mascot mood={r ? 'cheer' : 'happy'} size={110} />
        <div>
          <h2>{r ? 'Thanks for your review!' : 'Tell us what you think!'}</h2>
          <p>Your comments and suggestions go straight to the developer and help make Quiz ni Dether better for every teacher and student.</p>
        </div>
      </section>
      <section className="card form-wide">
        {r && !editing ? (
          <>
            <div className="card-head">
              <h2>Your review</h2>
              <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit review</button>
            </div>
            <div className="review-item">
              <Stars n={r.rating} />
              <p>{r.comment}</p>
              {r.suggestion && <p className="review-suggestion">💡 {r.suggestion}</p>}
              <div className="muted small">Last updated {fmtDt(r.updated_at)}</div>
            </div>
          </>
        ) : (
          <>
            <h2>{r ? 'Edit your review' : 'Write a review'}</h2>
            <ReviewForm initial={r} onSubmit={save} submitLabel={r ? 'Save review' : 'Send review'}
              extra={r && <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>} />
          </>
        )}
      </section>
    </>
  );
}
