/**
 * SAP PO Proxy Server
 * SAP POHeader OData API 를 프록시하는 Express 서버
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const SAPODataClient = require('./src/sapOdataClient');

const app = express();
const PORT = process.env.PORT || 3000;

// SAP OData 클라이언트 인스턴스
const sapClient = new SAPODataClient();

// 미들웨어 설정
app.use(helmet()); // 보안 헤더
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined')); // 로깅
app.use(express.json());

// 정적 파일 서빙 (docs/manual 등)
app.use(express.static(path.join(__dirname, '..')));

// ============================================
// API 엔드포인트
// ============================================

/**
 * Health Check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POHeader 전체 조회
 * GET /api/po-headers
 * 
 * Query Parameters:
 * - filter: OData $filter 조건 (예: "CompanyCode eq '1000'")
 * - select: OData $select 필드 (예: "PurchaseOrder,CompanyCode")
 * - top: 조회 건수 제한 (예: 50)
 * - skip: 페이징 (예: 0)
 * - orderby: 정렬 (예: "DocumentDate desc")
 */
app.get('/api/po-headers', async (req, res) => {
  try {
    const { filter, select, top, skip, orderby } = req.query;
    
    console.log('[API] POHeaders 조회 요청:', { filter, select, top, skip, orderby });
    
    const result = await sapClient.getPOHeaders({
      filter,
      select,
      top: top ? parseInt(top) : undefined,
      skip: skip ? parseInt(skip) : undefined,
      orderby
    });
    
    res.json(result);
  } catch (error) {
    console.error('[API] POHeaders 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 특정 PO 조회
 * GET /api/po-headers/:purchaseOrder
 */
app.get('/api/po-headers/:purchaseOrder', async (req, res) => {
  try {
    const { purchaseOrder } = req.params;
    
    console.log('[API] PO 조회 요청:', purchaseOrder);
    
    const result = await sapClient.getPOByNumber(purchaseOrder);
    
    res.json(result);
  } catch (error) {
    console.error('[API] PO 조회 오류:', error.message);
    
    // 404 오류는 404 상태 코드로 반환
    if (error.message.includes('404')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
});

/**
 * 조건부 PO 조회 (편의 엔드포인트)
 * GET /api/po-headers/search?companyCode=1000&vendor=0001000001
 */
app.get('/api/po-headers/search', async (req, res) => {
  try {
    const { companyCode, vendor, documentDate, top } = req.query;
    
    // 필터 조건 구성
    const filters = [];
    
    if (companyCode) {
      filters.push(`CompanyCode eq '${companyCode}'`);
    }
    
    if (vendor) {
      filters.push(`Vendor eq '${vendor}'`);
    }
    
    if (documentDate) {
      filters.push(`DocumentDate eq ${documentDate}`);
    }
    
    const filter = filters.length > 0 ? filters.join(' and ') : undefined;
    
    console.log('[API] 조건부 PO 조회 요청:', { companyCode, vendor, documentDate, top });
    
    const result = await sapClient.getPOHeaders({
      filter,
      top: top ? parseInt(top) : 50
    });
    
    res.json(result);
  } catch (error) {
    console.error('[API] 조건부 PO 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Dataset API Proxy (CORS 우회)
// ============================================

/**
 * 지식 목록 조회
 * GET /api/knowledge/datasets
 */
app.get('/api/knowledge/datasets', async (req, res) => {
  try {
    console.log('[Knowledge] Dataset 목록 조회 요청');
    const result = await sapClient.datasetApiCall('/datasets');
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] Dataset 목록 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 지식 검색 (Retrieve)
 * POST /api/knowledge/retrieve
 */
app.post('/api/knowledge/retrieve', async (req, res) => {
  try {
    const { query, dataset_id } = req.body;
    const dsId = dataset_id || process.env.DIFY_DATASET_ID || 'fOGqbX2rbavh2a5nQ6TXUGiQ';
    
    console.log('[Knowledge] 지식 검색 요청:', { query, dataset_id: dsId });
    
    const result = await sapClient.datasetApiCall('/datasets/' + dsId + '/retrieve', {
      method: 'POST',
      data: {
        query: query,
        retrieval_model: req.body.retrieval_model || {
          search_method: 'hybrid_search',
          reranking_enable: false,
          top_k: 10,
          score_threshold_enabled: false
        }
      }
    });
    
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 지식 검색 오류:', error.message);
    if (error.response) {
      console.error('[Knowledge] 응답:', error.response.data);
    }
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || ''
    });
  }
});

/**
 * 지식 생성
 * POST /api/knowledge/datasets
 */
app.post('/api/knowledge/datasets', async (req, res) => {
  try {
    console.log('[Knowledge] 지식 생성 요청:', req.body.name);
    const result = await sapClient.datasetApiCall('/datasets', {
      method: 'POST',
      data: req.body
    });
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 지식 생성 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 지식 삭제
 * DELETE /api/knowledge/datasets/:datasetId
 */
app.delete('/api/knowledge/datasets/:datasetId', async (req, res) => {
  try {
    const { datasetId } = req.params;
    console.log('[Knowledge] 지식 삭제 요청:', datasetId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId, {
      method: 'DELETE'
    });
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 지식 삭제 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 검색 설정 수정
 * PATCH /api/knowledge/datasets/:datasetId/retrieval-model
 */
app.patch('/api/knowledge/datasets/:datasetId/retrieval-model', async (req, res) => {
  try {
    const { datasetId } = req.params;
    console.log('[Knowledge] 검색 설정 수정 요청:', datasetId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/retrieval-model', {
      method: 'PATCH',
      data: req.body
    });
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 검색 설정 수정 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 문서 목록 조회
 * GET /api/knowledge/datasets/:datasetId/documents
 */
app.get('/api/knowledge/datasets/:datasetId/documents', async (req, res) => {
  try {
    const { datasetId } = req.params;
    console.log('[Knowledge] 문서 목록 조회 요청:', datasetId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/documents');
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 문서 목록 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 텍스트로 문서 생성
 * POST /api/knowledge/datasets/:datasetId/document/create_by_text
 */
app.post('/api/knowledge/datasets/:datasetId/document/create_by_text', async (req, res) => {
  try {
    const { datasetId } = req.params;
    console.log('[Knowledge] 텍스트로 문서 생성 요청:', datasetId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/document/create_by_text', {
      method: 'POST',
      data: req.body
    });
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 텍스트로 문서 생성 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 문서 삭제
 * DELETE /api/knowledge/datasets/:datasetId/documents/:documentId
 */
app.delete('/api/knowledge/datasets/:datasetId/documents/:documentId', async (req, res) => {
  try {
    const { datasetId, documentId } = req.params;
    console.log('[Knowledge] 문서 삭제 요청:', datasetId, documentId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId, {
      method: 'DELETE'
    });
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 문서 삭제 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 청크 목록 조회
 * GET /api/knowledge/datasets/:datasetId/documents/:documentId/segments
 */
app.get('/api/knowledge/datasets/:datasetId/documents/:documentId/segments', async (req, res) => {
  try {
    const { datasetId, documentId } = req.params;
    console.log('[Knowledge] 청크 목록 조회 요청:', datasetId, documentId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId + '/segments');
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 청크 목록 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 청크 생성
 * POST /api/knowledge/datasets/:datasetId/documents/:documentId/segments
 */
app.post('/api/knowledge/datasets/:datasetId/documents/:documentId/segments', async (req, res) => {
  try {
    const { datasetId, documentId } = req.params;
    console.log('[Knowledge] 청크 생성 요청:', datasetId, documentId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId + '/segments', {
      method: 'POST',
      data: req.body
    });
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 청크 생성 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 청크 삭제
 * DELETE /api/knowledge/datasets/:datasetId/documents/:documentId/segments/:segmentId
 */
app.delete('/api/knowledge/datasets/:datasetId/documents/:documentId/segments/:segmentId', async (req, res) => {
  try {
    const { datasetId, documentId, segmentId } = req.params;
    console.log('[Knowledge] 청크 삭제 요청:', datasetId, documentId, segmentId);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId + '/segments/' + segmentId, {
      method: 'DELETE'
    });
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 청크 삭제 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 인덱싱 상태 조회
 * GET /api/knowledge/datasets/:datasetId/documents/:batch/indexing-status
 */
app.get('/api/knowledge/datasets/:datasetId/documents/:batch/indexing-status', async (req, res) => {
  try {
    const { datasetId, batch } = req.params;
    console.log('[Knowledge] 인덱싱 상태 조회 요청:', datasetId, batch);
    const result = await sapClient.datasetApiCall('/datasets/' + datasetId + '/documents/' + batch + '/indexing-status');
    res.json(result.data);
  } catch (error) {
    console.error('[Knowledge] 인덱싱 상태 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 오류 처리 미들웨어
// ============================================

app.use((err, req, res, next) => {
  console.error('[Server] 오류:', err);
  
  res.status(500).json({
    success: false,
    error: '서버 오류가 발생했습니다.'
  });
});

// ============================================
// 서버 시작
// ============================================

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  SAP PO Proxy Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`========================================`);
  console.log(`  API Endpoints:`);
  console.log(`  GET  /health                    - Health Check`);
  console.log(`  GET  /api/po-headers            - POHeader 전체 조회`);
  console.log(`  GET  /api/po-headers/:poNumber  - 특정 PO 조회`);
  console.log(`  GET  /api/po-headers/search     - 조건부 PO 조회`);
  console.log(`========================================`);
});

module.exports = app;
