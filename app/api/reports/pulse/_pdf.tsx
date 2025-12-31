// app/api/reports/pulse/_pdf.tsx
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

type QA = { question: string; answer: string | null };
type ReviewerBlock = { reviewerName: string; reviewerEmail: string; responses: QA[] };

export type PulseReportData = {
  title: string;
  participantName: string;
  cohortName: string;
  generatedAt: string;
  reviewers: ReviewerBlock[];
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11 },
  coverTitle: { fontSize: 24, marginBottom: 12 },
  coverSub: { fontSize: 12, marginBottom: 6 },
  sectionTitle: { fontSize: 14, marginTop: 18, marginBottom: 8 },
  reviewerMeta: { fontSize: 10, marginBottom: 10 },
  qaBlock: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  q: { fontSize: 11, marginBottom: 4 },
  a: { fontSize: 11, color: "#333" },
  empty: { fontSize: 11, color: "#999" },
});

export function PulseReportPDF({ data }: { data: PulseReportData }) {
  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>{data.title}</Text>
        <Text style={styles.coverSub}>Participant: {data.participantName}</Text>
        <Text style={styles.coverSub}>Cohort: {data.cohortName}</Text>
        <Text style={styles.coverSub}>Generated: {data.generatedAt}</Text>
        <Text style={{ marginTop: 18, fontSize: 12 }}>
          This report compiles reviewer responses for the Pulse survey.
        </Text>
      </Page>

      {/* Reviewers */}
      {data.reviewers.map((rev, idx) => (
        <Page key={idx} size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Reviewer {idx + 1}</Text>
          <Text style={styles.reviewerMeta}>
            {rev.reviewerName} ({rev.reviewerEmail})
          </Text>

          {rev.responses.map((qa, qIdx) => (
            <View key={qIdx} style={styles.qaBlock}>
              <Text style={styles.q}>{qa.question}</Text>
              {qa.answer ? <Text style={styles.a}>{qa.answer}</Text> : <Text style={styles.empty}>No response.</Text>}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}