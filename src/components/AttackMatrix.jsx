import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildCoverage, coverageStats } from '../data/attack';
import styles from './AttackMatrix.module.css';

export default function AttackMatrix() {
  // cases.js is a static import, so this only ever computes once.
  const coverage = useMemo(() => buildCoverage(), []);
  const stats = useMemo(() => coverageStats(), []);

  return (
    <div className={styles.wrap}>
      <div className={`${styles.readout} reveal`}>
        <span><b>{stats.tacticsCovered}</b> of {stats.tacticsTotal} tactics observed</span>
        <span className={styles.sep}>&#10022;</span>
        <span><b>{stats.techniqueCount}</b> methods</span>
        <span className={styles.sep}>&#10022;</span>
        <span><b>{stats.caseCount}</b> cases</span>
        <span className={styles.sep}>&#10022;</span>
        <span className={styles.src}>drawn from the casebook</span>
      </div>

      <div className={styles.grid}>
        {coverage.map((col, ci) => {
          const empty = col.techniques.length === 0;
          return (
            <div
              key={col.tactic}
              className={`${styles.col} ${empty ? styles.colEmpty : ''} reveal`}
              style={{ transitionDelay: `${ci * 45}ms` }}
            >
              <div className={styles.colHead}>
                <span className={styles.colName}>{col.tactic}</span>
                <span className={styles.colCount}>{col.techniques.length}</span>
              </div>

              {empty ? (
                <div className={styles.none}>not yet observed</div>
              ) : (
                col.techniques.map((t, ti) => (
                  <div
                    key={t.id}
                    className={styles.cell}
                    style={{ animationDelay: `${ci * 45 + ti * 70 + 200}ms` }}
                  >
                    <div className={styles.tid}>{t.id}</div>
                    <div className={styles.tname}>{t.name}</div>
                    <div className={styles.tcases}>
                      {t.cases.map((c) => (
                        <Link key={c.id} to={`/case/${c.id}`} className={styles.chip}>
                          {c.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
